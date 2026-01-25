import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";

export async function GET() {
  try {
    // Get basic counts
    const [
      totalAccounts,
      totalCards,
      totalEvents,
      totalQueuePositions,
      totalPurchases,
      successfulPurchases,
      failedPurchases,
      totalProxies,
      totalImapCredentials,
    ] = await Promise.all([
      prisma.account.count(),
      prisma.card.count({ where: { deletedAt: null } }), // Only count non-deleted cards
      prisma.event.count(),
      prisma.queuePosition.count(),
      prisma.purchase.count(),
      prisma.purchase.count({ where: { status: PurchaseStatus.SUCCESS } }),
      prisma.purchase.count({ where: { status: PurchaseStatus.FAILED } }),
      prisma.proxy.count(),
      prisma.imapCredential.count(),
    ]);

    // Calculate success rate
    const successRate =
      totalPurchases > 0
        ? Math.round((successfulPurchases / totalPurchases) * 100)
        : 0;

    // Get total revenue from successful purchases
    const revenueResult = await prisma.purchase.aggregate({
      where: { status: PurchaseStatus.SUCCESS },
      _sum: { totalPrice: true },
    });
    const totalRevenue = revenueResult._sum.totalPrice?.toNumber() || 0;

    // Get total ticket count from successful purchases
    const ticketResult = await prisma.purchase.aggregate({
      where: { status: PurchaseStatus.SUCCESS },
      _sum: { quantity: true },
    });
    const totalTickets = ticketResult._sum.quantity || 0;

    // Get recent purchases (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [recentPurchases, recentSuccessful] = await Promise.all([
      prisma.purchase.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.purchase.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: PurchaseStatus.SUCCESS,
        },
      }),
    ]);

    // Get accounts with cards (at least one non-deleted card)
    const accountsWithCards = await prisma.account.count({
      where: { cards: { some: { deletedAt: null } } },
    });

    // Get average queue position from recent queue tests
    const avgQueueResult = await prisma.queuePosition.aggregate({
      _avg: { position: true },
    });
    const avgQueuePosition = Math.round(avgQueueResult._avg.position || 0);

    // Get recent queue tests (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentQueueTests = await prisma.queuePosition.count({
      where: { testedAt: { gte: thirtyDaysAgo } },
    });

    // Get top 5 recent events by queue positions
    const recentEvents = await prisma.event.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            queuePositions: true,
            purchases: true,
          },
        },
      },
    });

    // Get recent purchases with details
    const latestPurchases = await prisma.purchase.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        account: { select: { email: true } },
        event: { select: { eventName: true } },
      },
    });

    // Debug logging
    console.log("Stats calculated:", {
      totalPurchases,
      successfulPurchases,
      totalRevenue,
      totalTickets,
    });

    return NextResponse.json({
      accounts: {
        total: totalAccounts,
        withCards: accountsWithCards,
        withoutCards: totalAccounts - accountsWithCards,
      },
      cards: {
        total: totalCards,
      },
      proxies: {
        total: totalProxies,
      },
      imapCredentials: {
        total: totalImapCredentials,
      },
      events: {
        total: totalEvents,
        recent: recentEvents.map((e) => ({
          id: e.id,
          tmEventId: e.tmEventId,
          name: e.eventName,
          queueTests: e._count.queuePositions,
          purchases: e._count.purchases,
        })),
      },
      queues: {
        total: totalQueuePositions,
        recent: recentQueueTests,
        avgPosition: avgQueuePosition,
      },
      purchases: {
        total: totalPurchases,
        successful: successfulPurchases,
        failed: failedPurchases,
        successRate,
        recent: recentPurchases,
        recentSuccessful,
        totalRevenue,
        totalTickets,
        latest: latestPurchases.map((p) => ({
          id: p.id,
          email: p.account.email,
          event: p.event?.eventName || "Unknown",
          status: p.status,
          total: p.totalPrice?.toNumber() || 0,
          quantity: p.quantity,
          section: p.section,
          row: p.row,
          seats: p.seats,
          createdAt: p.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats", details: String(error) },
      { status: 500 }
    );
  }
}
