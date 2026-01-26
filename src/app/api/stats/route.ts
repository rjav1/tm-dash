import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus, TicketStatus } from "@prisma/client";

export async function GET() {
  try {
    // Date boundaries
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
      prisma.card.count({ where: { deletedAt: null } }),
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

    // ===============================
    // WEEK-OVER-WEEK COMPARISONS
    // ===============================
    const [thisWeekRevenue, lastWeekRevenue, thisWeekPurchases, lastWeekPurchases] = await Promise.all([
      prisma.purchase.aggregate({
        where: { status: PurchaseStatus.SUCCESS, createdAt: { gte: sevenDaysAgo } },
        _sum: { totalPrice: true },
      }),
      prisma.purchase.aggregate({
        where: { 
          status: PurchaseStatus.SUCCESS, 
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } 
        },
        _sum: { totalPrice: true },
      }),
      prisma.purchase.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.purchase.count({
        where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      }),
    ]);

    const thisWeekRevenueVal = thisWeekRevenue._sum.totalPrice?.toNumber() || 0;
    const lastWeekRevenueVal = lastWeekRevenue._sum.totalPrice?.toNumber() || 0;
    const revenueChange = lastWeekRevenueVal > 0 
      ? Math.round(((thisWeekRevenueVal - lastWeekRevenueVal) / lastWeekRevenueVal) * 100) 
      : thisWeekRevenueVal > 0 ? 100 : 0;

    // ===============================
    // DAILY TRENDS (Last 30 days)
    // ===============================
    const dailyPurchases = await prisma.purchase.groupBy({
      by: ['createdAt'],
      where: {
        status: PurchaseStatus.SUCCESS,
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { totalPrice: true, quantity: true },
      _count: true,
    });

    // Aggregate by date (since createdAt includes time)
    const dailyMap = new Map<string, { revenue: number; count: number; tickets: number }>();
    dailyPurchases.forEach((p) => {
      const dateStr = p.createdAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateStr) || { revenue: 0, count: 0, tickets: 0 };
      dailyMap.set(dateStr, {
        revenue: existing.revenue + (p._sum.totalPrice?.toNumber() || 0),
        count: existing.count + p._count,
        tickets: existing.tickets + (p._sum.quantity || 0),
      });
    });

    // Fill in missing days with zeros
    const dailyTrends: Array<{ date: string; revenue: number; count: number; tickets: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const data = dailyMap.get(dateStr) || { revenue: 0, count: 0, tickets: 0 };
      dailyTrends.push({ date: dateStr, ...data });
    }

    // ===============================
    // WEEKLY AGGREGATES (Last 8 weeks)
    // ===============================
    const weeklyTrends: Array<{ week: string; purchases: number; revenue: number; sales: number; salesRevenue: number }> = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      
      const weekLabel = `W${8 - i}`;
      
      const [purchaseData, salesData] = await Promise.all([
        prisma.purchase.aggregate({
          where: {
            status: PurchaseStatus.SUCCESS,
            createdAt: { gte: weekStart, lt: weekEnd },
          },
          _count: true,
          _sum: { totalPrice: true },
        }),
        prisma.sale.aggregate({
          where: {
            saleDate: { gte: weekStart, lt: weekEnd },
          },
          _count: true,
          _sum: { salePrice: true },
        }),
      ]);
      
      weeklyTrends.push({
        week: weekLabel,
        purchases: purchaseData._count,
        revenue: purchaseData._sum.totalPrice?.toNumber() || 0,
        sales: salesData._count,
        salesRevenue: salesData._sum.salePrice?.toNumber() || 0,
      });
    }

    // ===============================
    // PROFIT CALCULATIONS
    // ===============================
    // Realized profit: from completed sales with invoices
    const salesWithInvoices = await prisma.sale.findMany({
      where: { isComplete: true },
      include: {
        invoice: true,
        listing: { include: { purchase: true } },
      },
    });

    let realizedRevenue = 0;
    let realizedCost = 0;
    salesWithInvoices.forEach((sale) => {
      realizedRevenue += sale.salePrice?.toNumber() || 0;
      realizedCost += sale.cost?.toNumber() || 0;
    });
    const realizedProfit = realizedRevenue - realizedCost;

    // Unrealized profit: estimated from unsold listings using comparison prices
    const unsoldListings = await prisma.listing.findMany({
      where: {
        sales: { none: {} },
      },
      include: {
        purchase: true,
      },
    });

    let unrealizedRevenue = 0;
    let unrealizedCost = 0;
    unsoldListings.forEach((listing) => {
      unrealizedRevenue += listing.price?.toNumber() || 0;
      unrealizedCost += listing.cost?.toNumber() || 0;
    });
    const unrealizedProfit = unrealizedRevenue - unrealizedCost;

    // ===============================
    // TICKET PIPELINE
    // ===============================
    const ticketPipeline = await prisma.ticket.groupBy({
      by: ['status'],
      _count: true,
    });

    const pipelineMap: Record<string, number> = {};
    ticketPipeline.forEach((t) => {
      pipelineMap[t.status] = t._count;
    });

    const ticketsPurchased = pipelineMap[TicketStatus.PURCHASED] || 0;
    const ticketsListed = pipelineMap[TicketStatus.LISTED] || 0;
    const ticketsSold = pipelineMap[TicketStatus.SOLD] || 0;
    const ticketsCancelled = pipelineMap[TicketStatus.CANCELLED] || 0;

    // Also count from purchases for fallback if Ticket model isn't used
    const purchaseTicketCount = await prisma.purchase.aggregate({
      where: { status: PurchaseStatus.SUCCESS },
      _sum: { quantity: true },
    });
    const totalPurchasedTickets = purchaseTicketCount._sum.quantity || 0;

    // ===============================
    // CARD HEALTH BREAKDOWN
    // ===============================
    const cardHealth = await prisma.card.groupBy({
      by: ['checkoutStatus'],
      where: { deletedAt: null },
      _count: true,
    });

    const cardHealthMap: Record<string, number> = {};
    cardHealth.forEach((c) => {
      cardHealthMap[c.checkoutStatus] = c._count;
    });

    // ===============================
    // CHECKOUT STATUS
    // ===============================
    const [
      checkoutQueued,
      checkoutRunning,
      checkoutSuccess,
      checkoutFailed,
      activeCheckoutRuns,
    ] = await Promise.all([
      prisma.checkoutJob.count({ where: { status: 'QUEUED' } }),
      prisma.checkoutJob.count({ where: { status: 'RUNNING' } }),
      prisma.checkoutJob.count({ where: { status: 'SUCCESS' } }),
      prisma.checkoutJob.count({ where: { status: 'FAILED' } }),
      prisma.checkoutRun.count({ where: { status: 'RUNNING' } }),
    ]);

    const checkoutTotal = checkoutSuccess + checkoutFailed;
    const checkoutSuccessRate = checkoutTotal > 0 
      ? Math.round((checkoutSuccess / checkoutTotal) * 100) 
      : 0;

    // ===============================
    // GENERATOR STATUS
    // ===============================
    const [
      generatorPending,
      generatorRunning,
      generatorTasksToday,
      generatorSuccessToday,
    ] = await Promise.all([
      prisma.generatorJob.count({ where: { status: 'PENDING' } }),
      prisma.generatorJob.count({ where: { status: 'RUNNING' } }),
      prisma.generatorTask.count({
        where: { createdAt: { gte: new Date(now.toISOString().split('T')[0]) } },
      }),
      prisma.generatorTask.count({
        where: { 
          status: 'SUCCESS',
          completedAt: { gte: new Date(now.toISOString().split('T')[0]) },
        },
      }),
    ]);

    // ===============================
    // TOP EVENTS BY PROFIT
    // ===============================
    const eventsWithPurchases = await prisma.event.findMany({
      where: {
        purchases: { some: { status: PurchaseStatus.SUCCESS } },
      },
      include: {
        purchases: {
          where: { status: PurchaseStatus.SUCCESS },
          select: { totalPrice: true, quantity: true },
        },
        sales: {
          select: { salePrice: true, cost: true, quantity: true },
        },
      },
      take: 20,
    });

    const topEvents = eventsWithPurchases.map((event) => {
      const totalCost = event.purchases.reduce((sum, p) => sum + (p.totalPrice?.toNumber() || 0), 0);
      const totalTicketsBought = event.purchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const salesRevenue = event.sales.reduce((sum, s) => sum + (s.salePrice?.toNumber() || 0), 0);
      const salesCost = event.sales.reduce((sum, s) => sum + (s.cost?.toNumber() || 0), 0);
      const ticketsSold = event.sales.reduce((sum, s) => sum + (s.quantity || 0), 0);
      const profit = salesRevenue - salesCost;
      const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

      return {
        id: event.id,
        name: event.eventName,
        venue: event.venue,
        eventDate: event.eventDate,
        totalCost,
        ticketsBought: totalTicketsBought,
        ticketsSold,
        salesRevenue,
        profit,
        roi,
      };
    }).sort((a, b) => b.profit - a.profit).slice(0, 10);

    // ===============================
    // QUEUE PERFORMANCE
    // ===============================
    const avgQueueResult = await prisma.queuePosition.aggregate({
      _avg: { position: true },
      _min: { position: true },
      _max: { position: true },
    });

    const recentQueueTests = await prisma.queuePosition.count({
      where: { testedAt: { gte: thirtyDaysAgo } },
    });

    // Percentile calculations (using raw query for efficiency)
    const percentileData = await prisma.queuePosition.findMany({
      where: { excluded: false },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    const p10Index = Math.floor(percentileData.length * 0.1);
    const p50Index = Math.floor(percentileData.length * 0.5);
    const p90Index = Math.floor(percentileData.length * 0.9);

    const queuePercentiles = {
      p10: percentileData[p10Index]?.position || 0,
      p50: percentileData[p50Index]?.position || 0,
      p90: percentileData[p90Index]?.position || 0,
    };

    // ===============================
    // RECENT SALES
    // ===============================
    const recentSales = await prisma.sale.findMany({
      take: 10,
      orderBy: { saleDate: 'desc' },
      include: {
        invoice: { select: { payoutStatus: true, isPaid: true } },
        listing: { select: { eventName: true, section: true, row: true } },
      },
    });

    // ===============================
    // UPCOMING EVENTS WITH INVENTORY
    // ===============================
    const upcomingEvents = await prisma.event.findMany({
      where: {
        eventDate: { gte: now },
      },
      orderBy: { eventDate: 'asc' },
      take: 10,
      include: {
        _count: {
          select: {
            purchases: { where: { status: PurchaseStatus.SUCCESS } },
            tickets: true,
          },
        },
        listings: {
          where: { sales: { none: {} } },
          select: { quantity: true, price: true },
        },
      },
    });

    const upcomingWithValue = upcomingEvents.map((event) => {
      const unsoldTickets = event.listings.reduce((sum, l) => sum + l.quantity, 0);
      const estimatedValue = event.listings.reduce((sum, l) => sum + (l.price?.toNumber() || 0) * l.quantity, 0);

      return {
        id: event.id,
        name: event.eventName,
        venue: event.venue,
        eventDate: event.eventDate,
        purchases: event._count.purchases,
        ticketCount: event._count.tickets,
        unsoldTickets,
        estimatedValue,
      };
    });

    // ===============================
    // ACCOUNTS WITH CARDS
    // ===============================
    const accountsWithCards = await prisma.account.count({
      where: { cards: { some: { deletedAt: null } } },
    });

    // ===============================
    // RECENT EVENTS (existing)
    // ===============================
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

    // ===============================
    // LATEST PURCHASES (existing)
    // ===============================
    const latestPurchases = await prisma.purchase.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        account: { select: { email: true } },
        event: { select: { eventName: true } },
        listings: {
          include: {
            sales: { select: { salePrice: true, isComplete: true } },
          },
        },
      },
    });

    return NextResponse.json({
      // Basic counts
      accounts: {
        total: totalAccounts,
        withCards: accountsWithCards,
        withoutCards: totalAccounts - accountsWithCards,
      },
      cards: {
        total: totalCards,
        health: cardHealthMap,
      },
      proxies: {
        total: totalProxies,
      },
      imapCredentials: {
        total: totalImapCredentials,
      },

      // Events
      events: {
        total: totalEvents,
        recent: recentEvents.map((e) => ({
          id: e.id,
          tmEventId: e.tmEventId,
          name: e.eventName,
          queueTests: e._count.queuePositions,
          purchases: e._count.purchases,
        })),
        upcoming: upcomingWithValue,
        topByProfit: topEvents,
      },

      // Queue analytics
      queues: {
        total: totalQueuePositions,
        recent: recentQueueTests,
        avgPosition: Math.round(avgQueueResult._avg.position || 0),
        minPosition: avgQueueResult._min.position || 0,
        maxPosition: avgQueueResult._max.position || 0,
        percentiles: queuePercentiles,
      },

      // Purchase data
      purchases: {
        total: totalPurchases,
        successful: successfulPurchases,
        failed: failedPurchases,
        successRate,
        thisWeek: thisWeekPurchases,
        lastWeek: lastWeekPurchases,
        totalRevenue,
        totalTickets,
        latest: latestPurchases.map((p) => {
          const hasSale = p.listings.some(l => l.sales.length > 0);
          const saleRevenue = p.listings.reduce((sum, l) => 
            sum + l.sales.reduce((s, sale) => s + (sale.salePrice?.toNumber() || 0), 0), 0);
          
          return {
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
            hasSale,
            saleRevenue,
          };
        }),
      },

      // Revenue & profit
      revenue: {
        total: totalRevenue,
        thisWeek: thisWeekRevenueVal,
        lastWeek: lastWeekRevenueVal,
        weekOverWeekChange: revenueChange,
      },
      profit: {
        realized: realizedProfit,
        realizedRevenue,
        realizedCost,
        unrealized: unrealizedProfit,
        unrealizedRevenue,
        unrealizedCost,
      },

      // Ticket pipeline
      pipeline: {
        purchased: ticketsPurchased || totalPurchasedTickets,
        listed: ticketsListed,
        sold: ticketsSold,
        cancelled: ticketsCancelled,
      },

      // Trends
      trends: {
        daily: dailyTrends,
        weekly: weeklyTrends,
      },

      // Operations
      checkout: {
        queued: checkoutQueued,
        running: checkoutRunning,
        success: checkoutSuccess,
        failed: checkoutFailed,
        successRate: checkoutSuccessRate,
        activeWorkers: activeCheckoutRuns,
      },
      generator: {
        pending: generatorPending,
        running: generatorRunning,
        tasksToday: generatorTasksToday,
        successToday: generatorSuccessToday,
      },

      // Recent sales
      sales: {
        recent: recentSales.map((s) => ({
          id: s.id,
          eventName: s.listing?.eventName || s.eventName || 'Unknown',
          section: s.listing?.section || s.section,
          row: s.listing?.row || s.row,
          quantity: s.quantity,
          salePrice: s.salePrice?.toNumber() || 0,
          saleDate: s.saleDate,
          payoutStatus: s.invoice?.payoutStatus || 'Pending',
          isPaid: s.invoice?.isPaid || false,
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
