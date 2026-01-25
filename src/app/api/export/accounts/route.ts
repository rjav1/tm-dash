import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";
import {
  calculateEventPerformances,
  calculateAccountScore,
  sortAccountScores,
  type SortCriteria,
} from "@/lib/analytics";

/**
 * POST /api/export/accounts
 * Export selected or all accounts to CSV
 * 
 * Body: { accountIds?: string[], sortBy?: string, minEvents?: number }
 * - If accountIds provided, export those specific accounts
 * - If not, export all accounts matching filters
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { accountIds, sortBy = "compositeScore", minEvents = 1 } = body;

    // Get all queue positions
    const queuePositions = await prisma.queuePosition.findMany({
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
          },
        },
      },
    });

    if (queuePositions.length === 0) {
      return new NextResponse("No data to export", { status: 400 });
    }

    // Build event participant counts map
    const eventParticipantCounts = new Map<string, { count: number; positions: number[] }>();
    for (const qp of queuePositions) {
      const existing = eventParticipantCounts.get(qp.eventId) || { count: 0, positions: [] };
      existing.count++;
      existing.positions.push(qp.position);
      eventParticipantCounts.set(qp.eventId, existing);
    }

    // Sort positions arrays
    for (const [, data] of eventParticipantCounts) {
      data.positions.sort((a, b) => a - b);
    }

    // Group queue positions by account
    const accountQueuePositions = new Map<string, {
      email: string;
      positions: Array<{
        eventId: string;
        eventName: string;
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

    // Calculate scores
    const accountScores = [];
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

    // Filter by accountIds if provided
    let filteredScores = accountIds && accountIds.length > 0
      ? accountScores.filter(s => accountIds.includes(s.accountId))
      : accountScores;

    // Filter by minEvents
    filteredScores = filteredScores.filter(s => s.eventsEntered >= minEvents);

    // Sort
    const sortedScores = sortAccountScores(filteredScores, sortBy as SortCriteria, true);

    // Generate CSV
    const headers = [
      "Email",
      "Events Entered",
      "Composite Score",
      "Confidence",
      "Avg Percentile",
      "Weighted Percentile",
      "Best Percentile",
      "Worst Percentile",
      "Percentile Range",
      "Consistency Score",
      "Recent Avg Percentile",
      "Improvement Score",
      "Has Purchased",
      "Last Tested",
      "Event Performances",
    ];

    const rows = sortedScores.map(score => [
      score.email,
      score.eventsEntered,
      score.scoreBreakdown.compositeScore.toFixed(1),
      score.scoreBreakdown.confidence,
      score.avgPercentile.toFixed(1),
      score.weightedPercentile.toFixed(1),
      score.bestPercentile.toFixed(1),
      score.worstPercentile.toFixed(1),
      score.percentileRange.toFixed(1),
      score.consistencyScore.toFixed(0),
      score.recentAvgPercentile.toFixed(1),
      score.improvementScore.toFixed(1),
      score.hasPurchased ? "Yes" : "No",
      score.lastTestedAt?.toISOString() || "",
      // Event performances as semicolon-separated list
      score.performances
        .map(p => `${p.eventName}:${p.percentile.toFixed(1)}%`)
        .join("; "),
    ]);

    // Build CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(cell => {
          const str = String(cell);
          // Escape quotes and wrap in quotes if contains comma or quote
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(",")
      ),
    ].join("\n");

    // Return as CSV file download
    const filename = `account-rankings-${new Date().toISOString().split("T")[0]}.csv`;
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export accounts", details: String(error) },
      { status: 500 }
    );
  }
}
