import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";
import {
  calculateEventPerformances,
  calculateAccountScore,
  sortAccountScores,
  analyzeReroll,
  type SortCriteria,
  type AccountScore,
} from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId") || "";
    const sortBy = (searchParams.get("sortBy") || "compositeScore") as SortCriteria;
    const sortOrder = searchParams.get("sortOrder") || "asc";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const rerollDateStr = searchParams.get("rerollDate");
    const minEvents = parseInt(searchParams.get("minEvents") || "1", 10); // Filter for consistent performers

    // Get all queue positions with account and event info (excluding excluded positions)
    const whereClause: Record<string, unknown> = { excluded: false };
    if (eventId) {
      whereClause.eventId = eventId;
    }
    
    const queuePositions = await prisma.queuePosition.findMany({
      where: whereClause,
      include: {
        account: {
          select: {
            id: true,
            email: true,
          },
        },
        event: {
          select: {
            id: true,
            eventName: true,
            artistName: true,
            eventDateRaw: true,
            venue: true,
          },
        },
      },
    });

    if (queuePositions.length === 0) {
      return NextResponse.json({
        accounts: [],
        stats: {
          totalAccounts: 0,
          totalEvents: 0,
          totalQueueTests: 0,
        },
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    // Build event participant counts map
    const eventParticipantCounts = new Map<string, { count: number; positions: number[] }>();
    for (const qp of queuePositions) {
      const existing = eventParticipantCounts.get(qp.eventId) || { count: 0, positions: [] };
      existing.count++;
      existing.positions.push(qp.position);
      eventParticipantCounts.set(qp.eventId, existing);
    }

    // Sort positions arrays for percentile calculation
    for (const [, data] of eventParticipantCounts) {
      data.positions.sort((a, b) => a - b);
    }

    // Group queue positions by account
    const accountQueuePositions = new Map<string, {
      email: string;
      positions: Array<{
        eventId: string;
        eventName: string;
        artistName: string | null;
        eventDateRaw: string | null;
        venue: string | null;
        position: number;
        testedAt: Date;
      }>;
    }>();

    for (const qp of queuePositions) {
      const existing = accountQueuePositions.get(qp.accountId) || {
        email: qp.account.email,
        positions: [],
      };
      existing.positions.push({
        eventId: qp.eventId,
        eventName: qp.event.eventName,
        artistName: qp.event.artistName,
        eventDateRaw: qp.event.eventDateRaw,
        venue: qp.event.venue,
        position: qp.position,
        testedAt: qp.testedAt,
      });
      accountQueuePositions.set(qp.accountId, existing);
    }

    // Get accounts with successful purchases
    const accountsWithPurchases = await prisma.purchase.findMany({
      where: { status: PurchaseStatus.SUCCESS },
      select: { accountId: true },
      distinct: ["accountId"],
    });
    const purchasedAccountIds = new Set(accountsWithPurchases.map(p => p.accountId));

    // Calculate scores for each account
    const accountScores: AccountScore[] = [];
    for (const [accountId, data] of accountQueuePositions) {
      const performances = calculateEventPerformances(
        data.positions,
        eventParticipantCounts
      );

      const score = calculateAccountScore(
        accountId,
        data.email,
        performances,
        purchasedAccountIds.has(accountId)
      );

      accountScores.push(score);
    }

    // Filter by minEvents if specified
    const filteredScores = minEvents > 1
      ? accountScores.filter(s => s.eventsEntered >= minEvents)
      : accountScores;

    // Sort accounts
    const ascending = sortOrder === "asc";
    const sortedScores = sortAccountScores(filteredScores, sortBy, ascending);

    // Paginate
    const total = sortedScores.length;
    const pages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedScores = sortedScores.slice(skip, skip + limit);

    // Add ranks with full score breakdown
    const rankedScores = paginatedScores.map((score, index) => ({
      rank: skip + index + 1,
      accountId: score.accountId,
      email: score.email,
      hasPurchased: score.hasPurchased,
      eventsEntered: score.eventsEntered,
      // Round percentiles for cleaner display
      avgPercentile: Math.round(score.avgPercentile * 10) / 10,
      weightedPercentile: Math.round(score.weightedPercentile * 10) / 10,
      bestPercentile: Math.round(score.bestPercentile * 10) / 10,
      worstPercentile: Math.round(score.worstPercentile * 10) / 10,
      percentileRange: Math.round(score.percentileRange * 10) / 10,
      percentileStdDev: Math.round(score.percentileStdDev * 10) / 10,
      consistencyScore: Math.round(score.consistencyScore),
      recentAvgPercentile: Math.round(score.recentAvgPercentile * 10) / 10,
      improvementScore: Math.round(score.improvementScore * 10) / 10,
      lastTestedAt: score.lastTestedAt?.toISOString() || null,
      // Full transparent score breakdown
      scoreBreakdown: score.scoreBreakdown,
      // Simplify performances for response
      performances: score.performances.map(p => ({
        eventId: p.eventId,
        eventName: p.eventName,
        artistName: p.artistName,
        eventDateRaw: p.eventDateRaw,
        venue: p.venue,
        position: p.position,
        percentile: Math.round(p.percentile * 10) / 10,
        totalParticipants: p.totalParticipants,
        testedAt: p.testedAt.toISOString(),
      })),
    }));

    // Reroll analysis if date provided
    let rerollAnalysis = null;
    if (rerollDateStr) {
      const rerollDate = new Date(rerollDateStr);
      if (!isNaN(rerollDate.getTime())) {
        rerollAnalysis = analyzeReroll(accountScores, rerollDate)
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
          .slice(0, 50); // Top 50 most changed
      }
    }

    // Calculate overall stats
    const uniqueEvents = new Set(queuePositions.map(qp => qp.eventId));
    const avgComposite = filteredScores.length > 0
      ? filteredScores.reduce((sum, s) => sum + s.scoreBreakdown.compositeScore, 0) / filteredScores.length
      : 0;
    const stats = {
      totalAccounts: accountScores.length,
      filteredAccounts: filteredScores.length,
      totalEvents: uniqueEvents.size,
      totalQueueTests: queuePositions.length,
      avgPercentile: filteredScores.length > 0
        ? Math.round(filteredScores.reduce((sum, s) => sum + s.avgPercentile, 0) / filteredScores.length * 10) / 10
        : 0,
      avgCompositeScore: Math.round(avgComposite * 10) / 10,
      avgEventsPerAccount: filteredScores.length > 0
        ? Math.round(filteredScores.reduce((sum, s) => sum + s.eventsEntered, 0) / filteredScores.length * 10) / 10
        : 0,
      accountsWithMultipleEvents: accountScores.filter(s => s.eventsEntered >= 2).length,
    };

    return NextResponse.json({
      accounts: rankedScores,
      stats,
      rerollAnalysis,
      pagination: { page, limit, total, pages },
    });
  } catch (error) {
    console.error("Account rankings error:", error);
    return NextResponse.json(
      { error: "Failed to calculate account rankings", details: String(error) },
      { status: 500 }
    );
  }
}
