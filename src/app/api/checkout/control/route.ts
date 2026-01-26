import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/checkout/control
 * 
 * Control endpoint for checkout worker operations.
 * Provides TUI-equivalent functionality for the dashboard.
 * 
 * Actions:
 * - pause: Pause all workers (sets paused flag in config)
 * - resume: Resume all workers (clears paused flag)
 * - skip: Skip all running jobs (marks as CANCELLED)
 * - clear: Clear all non-imported jobs from queue
 * - retry_all: Retry all failed jobs (requeue them)
 * - cancel_job: Cancel a specific job by ID
 * - priority_retry: Reset a job to QUEUED with priority flag
 * - scale_workers: Change the number of workers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobId, workerCount } = body;

    switch (action) {
      case "pause": {
        // Set paused flag in config
        await prisma.checkoutConfig.upsert({
          where: { key: "paused" },
          update: { value: "true" },
          create: { key: "paused", value: "true" },
        });
        return NextResponse.json({
          success: true,
          message: "Workers paused",
          paused: true,
        });
      }

      case "resume": {
        // Clear paused flag
        await prisma.checkoutConfig.upsert({
          where: { key: "paused" },
          update: { value: "false" },
          create: { key: "paused", value: "false" },
        });
        return NextResponse.json({
          success: true,
          message: "Workers resumed",
          paused: false,
        });
      }

      case "skip": {
        // Cancel all RUNNING jobs
        const skipResult = await prisma.checkoutJob.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            errorCode: "SKIPPED",
            errorMessage: "Skipped by user",
          },
        });
        return NextResponse.json({
          success: true,
          message: `Skipped ${skipResult.count} running job(s)`,
          count: skipResult.count,
        });
      }

      case "clear": {
        // Delete all non-imported jobs
        const clearResult = await prisma.checkoutJob.deleteMany({
          where: {
            imported: false,
          },
        });
        return NextResponse.json({
          success: true,
          message: `Cleared ${clearResult.count} job(s) from queue`,
          count: clearResult.count,
        });
      }

      case "retry_all": {
        // Requeue all failed jobs
        const retryResult = await prisma.checkoutJob.updateMany({
          where: {
            status: { in: ["FAILED", "NEEDS_REVIEW"] },
          },
          data: {
            status: "QUEUED",
            workerId: null,
            startedAt: null,
            completedAt: null,
            errorCode: null,
            errorMessage: null,
            attemptCount: 0,
          },
        });
        return NextResponse.json({
          success: true,
          message: `Requeued ${retryResult.count} failed job(s)`,
          count: retryResult.count,
        });
      }

      case "cancel_job": {
        if (!jobId) {
          return NextResponse.json(
            { error: "jobId is required" },
            { status: 400 }
          );
        }
        
        const job = await prisma.checkoutJob.findUnique({
          where: { id: jobId },
        });
        
        if (!job) {
          return NextResponse.json(
            { error: "Job not found" },
            { status: 404 }
          );
        }
        
        if (job.status === "SUCCESS" || job.imported) {
          return NextResponse.json(
            { error: "Cannot cancel completed or imported job" },
            { status: 400 }
          );
        }
        
        await prisma.checkoutJob.update({
          where: { id: jobId },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            errorCode: "CANCELLED",
            errorMessage: "Cancelled by user",
          },
        });
        
        return NextResponse.json({
          success: true,
          message: "Job cancelled",
          jobId,
        });
      }

      case "priority_retry": {
        if (!jobId) {
          return NextResponse.json(
            { error: "jobId is required" },
            { status: 400 }
          );
        }
        
        const existingJob = await prisma.checkoutJob.findUnique({
          where: { id: jobId },
        });
        
        if (!existingJob) {
          return NextResponse.json(
            { error: "Job not found" },
            { status: 404 }
          );
        }
        
        // Reset job to QUEUED with high priority (100 = front of queue)
        await prisma.checkoutJob.update({
          where: { id: jobId },
          data: {
            status: "QUEUED",
            workerId: null,
            startedAt: null,
            completedAt: null,
            errorCode: null,
            errorMessage: null,
            attemptCount: 0,
          },
        });
        
        return NextResponse.json({
          success: true,
          message: "Job queued for priority retry (front of queue)",
          jobId,
        });
      }

      case "scale_workers": {
        if (workerCount === undefined || workerCount < 1 || workerCount > 10) {
          return NextResponse.json(
            { error: "workerCount must be between 1 and 10" },
            { status: 400 }
          );
        }
        
        await prisma.checkoutConfig.upsert({
          where: { key: "worker_parallelism" },
          update: { value: String(workerCount) },
          create: { key: "worker_parallelism", value: String(workerCount) },
        });
        
        return NextResponse.json({
          success: true,
          message: `Worker count set to ${workerCount}`,
          workerCount,
        });
      }

      case "clear_all_data": {
        // Delete all checkout jobs and runs (for clearing test data)
        const [jobsDeleted, runsDeleted] = await Promise.all([
          prisma.checkoutJob.deleteMany({}),
          prisma.checkoutRun.deleteMany({}),
        ]);
        
        return NextResponse.json({
          success: true,
          message: `Cleared ${jobsDeleted.count} jobs and ${runsDeleted.count} runs`,
          jobsDeleted: jobsDeleted.count,
          runsDeleted: runsDeleted.count,
        });
      }

      case "stop": {
        // Stop all workers and listener - signals end of run
        // 1. Set paused flag to stop workers from picking up new jobs
        await prisma.checkoutConfig.upsert({
          where: { key: "paused" },
          update: { value: "true" },
          create: { key: "paused", value: "true" },
        });
        
        // 2. Mark all RUNNING runs as ABORTED
        const runsAborted = await prisma.checkoutRun.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "ABORTED",
            endedAt: new Date(),
          },
        });
        
        // 3. Mark all active workers as STOPPED
        const workersUpdated = await prisma.checkoutWorker.updateMany({
          where: { status: { not: "STOPPED" } },
          data: {
            status: "STOPPED",
            stoppedAt: new Date(),
            currentJobId: null,
            currentEvent: null,
          },
        });
        
        // 4. Cancel any running jobs (they'll need to be retried)
        const jobsCancelled = await prisma.checkoutJob.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            errorCode: "STOPPED",
            errorMessage: "Stopped by user - run ended",
          },
        });
        
        // 5. Clear Discord listener heartbeat to signal it should stop
        await prisma.checkoutConfig.upsert({
          where: { key: "stop_listener" },
          update: { value: new Date().toISOString() },
          create: { key: "stop_listener", value: new Date().toISOString() },
        });
        
        return NextResponse.json({
          success: true,
          message: `Run stopped: ${runsAborted.count} run(s), ${workersUpdated.count} worker(s), ${jobsCancelled.count} job(s) cancelled`,
          runsAborted: runsAborted.count,
          workersUpdated: workersUpdated.count,
          jobsCancelled: jobsCancelled.count,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Control endpoint error:", error);
    return NextResponse.json(
      { error: "Control operation failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/checkout/control
 * Get current control state (paused status, worker count, etc.)
 */
export async function GET() {
  try {
    const [pausedConfig, workerConfig] = await Promise.all([
      prisma.checkoutConfig.findUnique({ where: { key: "paused" } }),
      prisma.checkoutConfig.findUnique({ where: { key: "worker_parallelism" } }),
    ]);

    // Get running workers count
    const activeRuns = await prisma.checkoutRun.count({
      where: { status: "RUNNING" },
    });

    // Get queue status
    const [queuedCount, runningCount, failedCount] = await Promise.all([
      prisma.checkoutJob.count({ where: { status: "QUEUED" } }),
      prisma.checkoutJob.count({ where: { status: "RUNNING" } }),
      prisma.checkoutJob.count({ where: { status: { in: ["FAILED", "NEEDS_REVIEW"] } } }),
    ]);

    return NextResponse.json({
      paused: pausedConfig?.value === "true",
      workerCount: parseInt(workerConfig?.value || "1", 10),
      activeWorkers: activeRuns,
      queue: {
        queued: queuedCount,
        running: runningCount,
        failed: failedCount,
      },
    });
  } catch (error) {
    console.error("Control status error:", error);
    return NextResponse.json(
      { error: "Failed to get control status" },
      { status: 500 }
    );
  }
}
