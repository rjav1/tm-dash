import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/stats
 * Get generator statistics for the dashboard
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

    // Get task status counts
    const taskStatusCounts = await prisma.generatorTask.groupBy({
      by: ["status"],
      where: {
        createdAt: { gte: startDate },
      },
      _count: { id: true },
    });

    const taskStatusMap: Record<string, number> = {};
    let totalTasks = 0;
    for (const item of taskStatusCounts) {
      taskStatusMap[item.status] = item._count.id;
      totalTasks += item._count.id;
    }

    // Calculate success rate
    const successCount = taskStatusMap["SUCCESS"] || 0;
    const failedCount = taskStatusMap["FAILED"] || 0;
    const completedCount = successCount + failedCount;
    const successRate = completedCount > 0 
      ? Math.round((successCount / completedCount) * 100) 
      : 0;

    // Get job status counts
    const jobStatusCounts = await prisma.generatorJob.groupBy({
      by: ["status"],
      where: {
        createdAt: { gte: startDate },
      },
      _count: { id: true },
    });

    const jobStatusMap: Record<string, number> = {};
    let totalJobs = 0;
    for (const item of jobStatusCounts) {
      jobStatusMap[item.status] = item._count.id;
      totalJobs += item._count.id;
    }

    // Auto-cleanup: Release orphaned emails (IN_USE but no matching pending/running task)
    // This handles edge cases where emails got stuck due to crashes or bugs
    const orphanedEmails = await prisma.$queryRaw<{ email: string }[]>`
      SELECT e.email 
      FROM generator_emails e
      LEFT JOIN generator_tasks t ON LOWER(t.email) = LOWER(e.email) AND t.status IN ('PENDING', 'RUNNING')
      WHERE e.status = 'IN_USE' AND t.id IS NULL
    `;
    
    if (orphanedEmails.length > 0) {
      await prisma.generatorEmail.updateMany({
        where: { 
          email: { in: orphanedEmails.map(e => e.email.toLowerCase()) },
          status: "IN_USE",
        },
        data: { status: "AVAILABLE" },
      });
      console.log(`[Stats] Auto-released ${orphanedEmails.length} orphaned email(s)`);
    }

    // Pool stats
    const emailsAvailable = await prisma.generatorEmail.count({
      where: { status: "AVAILABLE" },
    });

    const emailsInUse = await prisma.generatorEmail.count({
      where: { status: "IN_USE" },
    });

    const emailsUsed = await prisma.generatorEmail.count({
      where: { status: "USED" },
    });

    const proxiesAvailable = await prisma.generatorProxy.count({
      where: { status: "AVAILABLE" },
    });

    const proxiesInUse = await prisma.generatorProxy.count({
      where: { status: "IN_USE" },
    });

    const proxiesBad = await prisma.generatorProxy.count({
      where: { status: "BAD" },
    });

    // Get active runs and workers (runs in RUNNING status)
    // Workers send heartbeat every 10s, so we check for heartbeat within last 30s
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    // Auto-abort runs that have been stale for more than 2 minutes (no heartbeat)
    // This cleans up orphaned runs from crashed daemons
    // Runs without recent heartbeat are considered stale
    await prisma.generatorRun.updateMany({
      where: {
        status: "RUNNING",
        lastHeartbeat: { lt: twoMinutesAgo },
      },
      data: {
        status: "ABORTED",
        endedAt: new Date(),
      },
    });
    
    const activeRuns = await prisma.generatorRun.findMany({
      where: { status: "RUNNING" },
      select: {
        id: true,
        workerId: true,
        startedAt: true,
        lastHeartbeat: true,
        activeWorkerCount: true,
        jobsSuccess: true,
        jobsFailed: true,
        tasksSuccess: true,
        tasksFailed: true,
        _count: { select: { jobs: true } },
      },
    });

    // Auto-cleanup: Mark stale workers as STOPPED (no heartbeat in 30s)
    await prisma.generatorWorker.updateMany({
      where: {
        status: { not: "STOPPED" },
        lastHeartbeat: { lt: thirtySecondsAgo },
      },
      data: {
        status: "STOPPED",
        stoppedAt: new Date(),
        currentTaskId: null,
        currentEmail: null,
        currentStep: null,
        currentProgress: null,
      },
    });

    // Auto-cleanup: Reset orphaned RUNNING tasks back to PENDING
    // Tasks stuck in RUNNING for more than 3 minutes without completion are orphaned
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const orphanedTasks = await prisma.generatorTask.updateMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: threeMinutesAgo },
      },
      data: {
        status: "PENDING",
        workerName: null,
        startedAt: null,
        currentStep: null,
        stepDetail: "Reset - worker timeout",
        stepProgress: 0,
      },
    });
    if (orphanedTasks.count > 0) {
      console.log(`[Generator Stats] Reset ${orphanedTasks.count} orphaned RUNNING tasks to PENDING`);
    }

    // Get individual workers from generator_workers table
    // Only get workers that are not STOPPED and have heartbeat within last 30 seconds
    const individualWorkers = await prisma.generatorWorker.findMany({
      where: {
        status: { not: "STOPPED" },
        lastHeartbeat: { gte: thirtySecondsAgo },
      },
      select: {
        id: true,
        runId: true,
        workerName: true,
        deviceName: true,
        status: true,
        currentTaskId: true,
        currentEmail: true,
        currentStep: true,
        currentProgress: true,
        lastHeartbeat: true,
        startedAt: true,
        tasksCompleted: true,
        tasksFailed: true,
      },
      orderBy: { workerName: "asc" },
    });

    // Get currently running tasks to show what each worker is processing
    const runningTasks = await prisma.generatorTask.findMany({
      where: { status: "RUNNING" },
      select: {
        id: true,
        email: true,
        workerName: true,
        currentStep: true,
        stepDetail: true,
        stepProgress: true,
        startedAt: true,
        proxy: true,
        imapSource: true,
      },
    });

    // Get pending tasks count
    const pendingTasks = taskStatusMap["PENDING"] || 0;
    const runningTasksCount = taskStatusMap["RUNNING"] || 0;

    // Get top IMAP providers by usage
    const topProviders = await prisma.generatorTask.groupBy({
      by: ["imapSource"],
      where: {
        createdAt: { gte: startDate },
      },
      _count: { id: true },
    });

    // Calculate success rate per provider
    const providerSuccessRates = await Promise.all(
      topProviders.slice(0, 5).map(async (provider) => {
        const successTasks = await prisma.generatorTask.count({
          where: {
            createdAt: { gte: startDate },
            imapSource: provider.imapSource,
            status: "SUCCESS",
          },
        });
        const failedTasks = await prisma.generatorTask.count({
          where: {
            createdAt: { gte: startDate },
            imapSource: provider.imapSource,
            status: "FAILED",
          },
        });
        const total = successTasks + failedTasks;
        return {
          name: provider.imapSource,
          count: provider._count.id,
          successRate: total > 0 ? Math.round((successTasks / total) * 100) : 0,
        };
      })
    );

    // Get config for pause state and worker settings
    const pausedConfig = await prisma.generatorConfig.findUnique({
      where: { key: "paused" },
    });
    const isPaused = pausedConfig?.value === "true";

    const workerParallelismConfig = await prisma.generatorConfig.findUnique({
      where: { key: "worker_parallelism" },
    });
    const targetWorkerCount = parseInt(workerParallelismConfig?.value || "3", 10);

    return NextResponse.json({
      period,
      overview: {
        totalTasks,
        totalJobs,
        pending: pendingTasks,
        running: runningTasksCount,
        success: successCount,
        failed: failedCount,
        successRate,
      },
      jobs: {
        pending: jobStatusMap["PENDING"] || 0,
        running: jobStatusMap["RUNNING"] || 0,
        completed: jobStatusMap["COMPLETED"] || 0,
        failed: jobStatusMap["FAILED"] || 0,
        cancelled: jobStatusMap["CANCELLED"] || 0,
      },
      pools: {
        emailsAvailable,
        emailsInUse,
        emailsUsed,
        proxiesAvailable,
        proxiesInUse,
        proxiesBad,
      },
      workers: {
        active: activeRuns.length,
        totalThreads: individualWorkers.length,
        targetWorkerCount,
        isPaused,
        runs: activeRuns.map((run) => {
          const isStale = !run.lastHeartbeat || run.lastHeartbeat < thirtySecondsAgo;
          
          return {
            id: run.id,
            workerId: run.workerId,
            startedAt: run.startedAt,
            lastHeartbeat: run.lastHeartbeat?.toISOString() || null,
            activeWorkerCount: run.activeWorkerCount,
            jobsProcessed: run._count.jobs,
            jobsSuccess: run.jobsSuccess,
            jobsFailed: run.jobsFailed,
            tasksSuccess: run.tasksSuccess,
            tasksFailed: run.tasksFailed,
            isStale,
          };
        }),
        // Individual worker threads with detailed status
        threads: individualWorkers.map((worker) => {
          const isStale = worker.lastHeartbeat < thirtySecondsAgo;
          const currentTask = runningTasks.find(t => t.id === worker.currentTaskId);
          return {
            id: worker.id,
            runId: worker.runId,
            workerName: worker.workerName,
            deviceName: worker.deviceName,
            status: worker.status,
            currentTaskId: worker.currentTaskId,
            currentEmail: worker.currentEmail,
            currentStep: worker.currentStep,
            currentProgress: worker.currentProgress,
            lastHeartbeat: worker.lastHeartbeat.toISOString(),
            startedAt: worker.startedAt.toISOString(),
            tasksCompleted: worker.tasksCompleted,
            tasksFailed: worker.tasksFailed,
            isStale,
            currentTask: currentTask ? {
              email: currentTask.email,
              step: currentTask.currentStep,
              stepDetail: currentTask.stepDetail,
              progress: currentTask.stepProgress,
              startedAt: currentTask.startedAt,
              proxy: currentTask.proxy,
              imapSource: currentTask.imapSource,
            } : null,
          };
        }),
        runningTasks: runningTasks.length,
      },
      tasks: {
        pending: pendingTasks,
        running: runningTasksCount,
        completed: successCount + failedCount,
        success: successCount,
        failed: failedCount,
      },
      topProviders: providerSuccessRates,
    });
  } catch (error) {
    console.error("Error fetching generator stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch generator stats" },
      { status: 500 }
    );
  }
}
