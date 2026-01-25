import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";
import { calculatePercentile } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const skip = (page - 1) * limit;
    const sortBy = searchParams.get("sortBy") || "position";
    const sortOrder = searchParams.get("sortOrder") || "asc";

    const includeExcluded = searchParams.get("includeExcluded") === "true";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (eventId) {
      where.eventId = eventId;
    }
    
    // By default, don't include excluded positions in the main view
    if (!includeExcluded) {
      where.excluded = false;
    }

    // Get queue positions with related data
    const [queuePositions, total] = await Promise.all([
      prisma.queuePosition.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          account: {
            select: {
              id: true,
              email: true,
              status: true,
              cards: {
                where: { deletedAt: null },
                select: { id: true },
              },
            },
          },
          event: {
            select: {
              id: true,
              tmEventId: true,
              eventName: true,
            },
          },
        },
      }),
      prisma.queuePosition.count({ where }),
    ]);

    // Get all events for filter dropdown (count only non-excluded positions)
    const events = await prisma.event.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        tmEventId: true,
        eventName: true,
        artistName: true,
        eventDateRaw: true,
        venue: true,
        _count: {
          select: { 
            queuePositions: {
              where: { excluded: false }
            }
          },
        },
      },
    });

    // Get all NON-EXCLUDED positions for the selected event (for percentile calculation)
    let allEventPositions: number[] = [];
    let excludedCount = 0;
    
    if (eventId) {
      const [allPositions, excludedPositions] = await Promise.all([
        prisma.queuePosition.findMany({
          where: { eventId, excluded: false },
          select: { position: true },
          orderBy: { position: "asc" },
        }),
        prisma.queuePosition.count({
          where: { eventId, excluded: true },
        }),
      ]);
      allEventPositions = allPositions.map(p => p.position);
      excludedCount = excludedPositions;
    }

    // Get accounts with successful purchases (for hasPurchased column)
    const accountIds = queuePositions.map(q => q.accountId);
    const purchasedAccounts = await prisma.purchase.findMany({
      where: {
        accountId: { in: accountIds },
        status: PurchaseStatus.SUCCESS,
      },
      select: { accountId: true },
      distinct: ["accountId"],
    });
    const purchasedAccountIds = new Set(purchasedAccounts.map(p => p.accountId));

    // Calculate statistics for the selected event (excluding excluded positions)
    let stats = null;
    if (eventId) {
      const eventStats = await prisma.queuePosition.aggregate({
        where: { eventId, excluded: false },
        _avg: { position: true },
        _min: { position: true },
        _max: { position: true },
        _count: true,
      });

      stats = {
        avgPosition: Math.round(eventStats._avg.position || 0),
        minPosition: eventStats._min.position || 0,
        maxPosition: eventStats._max.position || 0,
        totalAccounts: eventStats._count,
      };
    }

    const formattedQueues = queuePositions.map((q) => {
      // Calculate percentile within event (only among non-excluded positions)
      const percentile = eventId && allEventPositions.length > 0
        ? calculatePercentile(q.position, allEventPositions)
        : null;

      return {
        id: q.id,
        position: q.position,
        percentile: percentile !== null ? Math.round(percentile * 10) / 10 : null,
        testedAt: q.testedAt,
        source: q.source,
        excluded: (q as { excluded?: boolean }).excluded || false,
        excludedReason: (q as { excludedReason?: string }).excludedReason || null,
        account: {
          id: q.account.id,
          email: q.account.email,
          status: q.account.status,
          hasCard: q.account.cards.length > 0,
          hasPurchased: purchasedAccountIds.has(q.accountId),
        },
        event: {
          id: q.event.id,
          tmEventId: q.event.tmEventId,
          name: q.event.eventName,
        },
      };
    });

    return NextResponse.json({
      queuePositions: formattedQueues,
      events: events.map((e) => ({
        id: e.id,
        tmEventId: e.tmEventId,
        name: e.artistName || e.eventName,
        eventDate: e.eventDateRaw,
        venue: e.venue,
        count: e._count.queuePositions,
      })),
      stats,
      excludedCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Queue positions fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue positions", details: String(error) },
      { status: 500 }
    );
  }
}
