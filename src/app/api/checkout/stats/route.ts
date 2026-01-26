import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/checkout/stats
 * Get checkout statistics for the dashboard
 * 
 * Query params:
 * - period: "today" | "week" | "month" | "all" (default: "today")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "today";

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "all":
        startDate = new Date(0); // Beginning of time
        break;
      case "today":
      default:
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    // Get status counts
    const statusCounts = await prisma.checkoutJob.groupBy({
      by: ["status"],
      where: {
        createdAt: { gte: startDate },
      },
      _count: { id: true },
    });

    const statusMap: Record<string, number> = {};
    let totalJobs = 0;
    for (const item of statusCounts) {
      statusMap[item.status] = item._count.id;
      totalJobs += item._count.id;
    }

    // Calculate success rate
    const successCount = statusMap["SUCCESS"] || 0;
    const failedCount = statusMap["FAILED"] || 0;
    const completedCount = successCount + failedCount;
    const successRate = completedCount > 0 
      ? Math.round((successCount / completedCount) * 100) 
      : 0;

    // Get import stats
    const importedCount = await prisma.checkoutJob.count({
      where: {
        createdAt: { gte: startDate },
        imported: true,
      },
    });

    const pendingImport = await prisma.checkoutJob.count({
      where: {
        createdAt: { gte: startDate },
        status: "SUCCESS",
        imported: false,
      },
    });

    // Get top events
    const topEvents = await prisma.checkoutJob.groupBy({
      by: ["eventName", "tmEventId"],
      where: {
        createdAt: { gte: startDate },
        eventName: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    // Get active workers (runs in RUNNING status) with their current jobs
    const activeRuns = await prisma.checkoutRun.findMany({
      where: { status: "RUNNING" },
      select: {
        id: true,
        workerId: true,
        startedAt: true,
        jobsSuccess: true,
        jobsFailed: true,
        _count: { select: { jobs: true } },
      },
    });

    // Get currently running jobs to show what each worker is processing
    const runningJobs = await prisma.checkoutJob.findMany({
      where: { status: "RUNNING" },
      select: {
        id: true,
        workerId: true,
        eventName: true,
        section: true,
        row: true,
        startedAt: true,
        cardLast4: true,
        errorMessage: true, // Used for status updates
      },
    });

    // Get cards usage stats
    const cardsUsed = await prisma.card.count({
      where: {
        useCount: { gt: 0 },
        checkoutStatus: { not: "DECLINED" },
      },
    });

    const cardsAvailable = await prisma.card.count({
      where: {
        checkoutStatus: "AVAILABLE",
        deletedAt: null,
      },
    });

    const cardsDeclined = await prisma.card.count({
      where: {
        checkoutStatus: "DECLINED",
      },
    });

    // Get total revenue (sum of totalPrice for successful jobs)
    const revenueResult = await prisma.checkoutJob.aggregate({
      where: {
        createdAt: { gte: startDate },
        status: "SUCCESS",
      },
      _sum: { totalPrice: true },
      _count: { id: true },
    });

    // Get queue size (QUEUED jobs)
    const queuedCount = statusMap["QUEUED"] || 0;
    const runningCount = statusMap["RUNNING"] || 0;

    return NextResponse.json({
      period,
      overview: {
        total: totalJobs,
        queued: queuedCount,
        running: runningCount,
        success: successCount,
        failed: failedCount,
        needsReview: statusMap["NEEDS_REVIEW"] || 0,
        cancelled: statusMap["CANCELLED"] || 0,
        successRate,
      },
      imports: {
        imported: importedCount,
        pendingImport,
      },
      workers: {
        active: activeRuns.length,
        runs: activeRuns.map((run) => {
          // Find the current job for this worker
          const currentJob = runningJobs.find(j => j.workerId === run.workerId);
          return {
            id: run.id,
            workerId: run.workerId,
            startedAt: run.startedAt,
            jobsProcessed: run._count.jobs,
            jobsSuccess: run.jobsSuccess,
            jobsFailed: run.jobsFailed,
            currentJob: currentJob ? {
              id: currentJob.id,
              eventName: currentJob.eventName,
              section: currentJob.section,
              row: currentJob.row,
              startedAt: currentJob.startedAt,
              cardLast4: currentJob.cardLast4,
              status: currentJob.errorMessage, // Daemon uses this for status updates
            } : null,
          };
        }),
        // Also include jobs being processed by workers not in a run session
        runningJobs: runningJobs.length,
      },
      cards: {
        available: cardsAvailable,
        used: cardsUsed,
        declined: cardsDeclined,
      },
      revenue: {
        totalValue: revenueResult._sum.totalPrice || 0,
        successfulCheckouts: revenueResult._count.id,
      },
      topEvents: topEvents.map((e) => ({
        eventName: e.eventName,
        tmEventId: e.tmEventId,
        count: e._count.id,
      })),
    });
  } catch (error) {
    console.error("Error fetching checkout stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch checkout stats" },
      { status: 500 }
    );
  }
}
