import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/generator/control
 * 
 * Control endpoint for generator worker operations.
 * Provides TUI-equivalent functionality for the dashboard.
 * 
 * Actions:
 * - start: Start a new run session
 * - stop: Stop all workers and end run
 * - pause: Pause all workers (sets paused flag in config)
 * - resume: Resume all workers (clears paused flag)
 * - skip: Skip all running tasks (marks as FAILED)
 * - clear: Clear all pending jobs from queue
 * - retry_all: Retry all failed tasks (requeue them)
 * - cancel_job: Cancel a specific job by ID
 * - cancel_task: Cancel a specific task by ID
 * - retry_task: Retry a specific task by ID
 * - scale_workers: Change the number of parallel workers
 * - clear_all_data: Clear all generator data (jobs, tasks, runs)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobId, taskId, workerCount } = body;

    switch (action) {
      case "start": {
        // Start a new run - signals workers to begin
        // 1. Clear paused flag to allow workers to pick up tasks
        await prisma.generatorConfig.upsert({
          where: { key: "paused" },
          update: { value: "false" },
          create: { key: "paused", value: "false" },
        });
        
        // 2. Check if there's already a running run
        const existingRun = await prisma.generatorRun.findFirst({
          where: { status: "RUNNING" },
        });
        
        let run = existingRun;
        if (!existingRun) {
          // 3. Create a new GeneratorRun (dashboard-initiated)
          run = await prisma.generatorRun.create({
            data: {
              workerId: "dashboard",
              status: "RUNNING",
              startedAt: new Date(),
            },
          });
        }
        
        return NextResponse.json({
          success: true,
          message: existingRun ? "Run resumed" : "New run started",
          runId: run?.id,
          isNewRun: !existingRun,
        });
      }

      case "stop": {
        // Stop all workers and end run
        // 1. Set paused flag to stop workers from picking up new tasks
        await prisma.generatorConfig.upsert({
          where: { key: "paused" },
          update: { value: "true" },
          create: { key: "paused", value: "true" },
        });
        
        // 2. Mark all RUNNING runs as ABORTED
        const runsAborted = await prisma.generatorRun.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "ABORTED",
            endedAt: new Date(),
          },
        });
        
        // 3. Mark all active workers as STOPPED
        const workersUpdated = await prisma.generatorWorker.updateMany({
          where: { status: { not: "STOPPED" } },
          data: {
            status: "STOPPED",
            stoppedAt: new Date(),
            currentTaskId: null,
            currentEmail: null,
            currentStep: null,
            currentProgress: null,
          },
        });
        
        // 4. Cancel any running tasks (they'll need to be retried)
        const tasksCancelled = await prisma.generatorTask.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: "Stopped by user - run ended",
            lastError: "STOPPED",
          },
        });
        
        return NextResponse.json({
          success: true,
          message: `Run stopped: ${runsAborted.count} run(s), ${workersUpdated.count} worker(s), ${tasksCancelled.count} task(s) cancelled`,
          runsAborted: runsAborted.count,
          workersUpdated: workersUpdated.count,
          tasksCancelled: tasksCancelled.count,
        });
      }

      case "pause": {
        // Set paused flag in config
        await prisma.generatorConfig.upsert({
          where: { key: "paused" },
          update: { value: "true" },
          create: { key: "paused", value: "true" },
        });
        
        // Update all active workers to PAUSED status
        await prisma.generatorWorker.updateMany({
          where: { status: { in: ["IDLE", "PROCESSING"] } },
          data: { status: "PAUSED" },
        });
        
        return NextResponse.json({
          success: true,
          message: "Generator workers paused",
          paused: true,
        });
      }

      case "resume": {
        // Clear paused flag
        await prisma.generatorConfig.upsert({
          where: { key: "paused" },
          update: { value: "false" },
          create: { key: "paused", value: "false" },
        });
        
        // Update all PAUSED workers back to IDLE
        await prisma.generatorWorker.updateMany({
          where: { status: "PAUSED" },
          data: { status: "IDLE" },
        });
        
        return NextResponse.json({
          success: true,
          message: "Generator workers resumed",
          paused: false,
        });
      }

      case "skip": {
        // Cancel all RUNNING tasks
        const skipResult = await prisma.generatorTask.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: "Skipped by user",
            lastError: "SKIPPED",
          },
        });
        
        // Update workers to IDLE
        await prisma.generatorWorker.updateMany({
          where: { status: "PROCESSING" },
          data: {
            status: "IDLE",
            currentTaskId: null,
            currentEmail: null,
            currentStep: null,
            currentProgress: null,
          },
        });
        
        return NextResponse.json({
          success: true,
          message: `Skipped ${skipResult.count} running task(s)`,
          count: skipResult.count,
        });
      }

      case "clear": {
        // Delete all PENDING jobs (cascade deletes tasks)
        const clearResult = await prisma.generatorJob.deleteMany({
          where: {
            status: "PENDING",
          },
        });
        return NextResponse.json({
          success: true,
          message: `Cleared ${clearResult.count} pending job(s)`,
          count: clearResult.count,
        });
      }

      case "retry_all": {
        // Retry all failed tasks
        const retryResult = await prisma.generatorTask.updateMany({
          where: {
            status: "FAILED",
          },
          data: {
            status: "PENDING",
            startedAt: null,
            completedAt: null,
            errorMessage: null,
            lastError: null,
            workerName: null,
            currentStep: null,
            stepDetail: null,
            stepProgress: null,
            retryCount: { increment: 1 },
          },
        });
        return NextResponse.json({
          success: true,
          message: `Requeued ${retryResult.count} failed task(s)`,
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
        
        const job = await prisma.generatorJob.findUnique({
          where: { id: jobId },
        });
        
        if (!job) {
          return NextResponse.json(
            { error: "Job not found" },
            { status: 404 }
          );
        }
        
        if (job.status === "COMPLETED") {
          return NextResponse.json(
            { error: "Cannot cancel completed job" },
            { status: 400 }
          );
        }
        
        // Cancel the job
        await prisma.generatorJob.update({
          where: { id: jobId },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
          },
        });
        
        // Also cancel all pending/running tasks in this job
        await prisma.generatorTask.updateMany({
          where: { 
            jobId,
            status: { in: ["PENDING", "RUNNING"] },
          },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: "Job cancelled by user",
            lastError: "CANCELLED",
          },
        });
        
        return NextResponse.json({
          success: true,
          message: "Job cancelled",
          jobId,
        });
      }

      case "cancel_task": {
        if (!taskId) {
          return NextResponse.json(
            { error: "taskId is required" },
            { status: 400 }
          );
        }
        
        const task = await prisma.generatorTask.findUnique({
          where: { id: taskId },
        });
        
        if (!task) {
          return NextResponse.json(
            { error: "Task not found" },
            { status: 404 }
          );
        }
        
        if (task.status === "SUCCESS") {
          return NextResponse.json(
            { error: "Cannot cancel successful task" },
            { status: 400 }
          );
        }
        
        await prisma.generatorTask.update({
          where: { id: taskId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: "Cancelled by user",
            lastError: "CANCELLED",
          },
        });
        
        return NextResponse.json({
          success: true,
          message: "Task cancelled",
          taskId,
        });
      }

      case "retry_task": {
        if (!taskId) {
          return NextResponse.json(
            { error: "taskId is required" },
            { status: 400 }
          );
        }
        
        const task = await prisma.generatorTask.findUnique({
          where: { id: taskId },
        });
        
        if (!task) {
          return NextResponse.json(
            { error: "Task not found" },
            { status: 404 }
          );
        }
        
        if (task.status !== "FAILED") {
          return NextResponse.json(
            { error: "Only failed tasks can be retried" },
            { status: 400 }
          );
        }
        
        await prisma.generatorTask.update({
          where: { id: taskId },
          data: {
            status: "PENDING",
            startedAt: null,
            completedAt: null,
            errorMessage: null,
            lastError: null,
            workerName: null,
            currentStep: null,
            stepDetail: null,
            stepProgress: null,
            retryCount: { increment: 1 },
          },
        });
        
        return NextResponse.json({
          success: true,
          message: "Task queued for retry",
          taskId,
        });
      }

      case "scale_workers": {
        if (workerCount === undefined || workerCount < 1 || workerCount > 10) {
          return NextResponse.json(
            { error: "workerCount must be between 1 and 10" },
            { status: 400 }
          );
        }
        
        await prisma.generatorConfig.upsert({
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
        // Delete all generator jobs, tasks, runs, and workers (for clearing test data)
        const [tasksDeleted, jobsDeleted, workersDeleted, runsDeleted] = await Promise.all([
          prisma.generatorTask.deleteMany({}),
          prisma.generatorJob.deleteMany({}),
          prisma.generatorWorker.deleteMany({}),
          prisma.generatorRun.deleteMany({}),
        ]);
        
        return NextResponse.json({
          success: true,
          message: `Cleared ${jobsDeleted.count} jobs, ${tasksDeleted.count} tasks, ${runsDeleted.count} runs, ${workersDeleted.count} workers`,
          tasksDeleted: tasksDeleted.count,
          jobsDeleted: jobsDeleted.count,
          runsDeleted: runsDeleted.count,
          workersDeleted: workersDeleted.count,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Generator control error:", error);
    return NextResponse.json(
      { error: "Control operation failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generator/control
 * Get current control state
 */
export async function GET() {
  try {
    const [pausedConfig, workerConfig] = await Promise.all([
      prisma.generatorConfig.findUnique({ where: { key: "paused" } }),
      prisma.generatorConfig.findUnique({ where: { key: "worker_parallelism" } }),
    ]);

    // Get running runs count
    const activeRuns = await prisma.generatorRun.count({
      where: { status: "RUNNING" },
    });

    // Get active workers count
    const activeWorkers = await prisma.generatorWorker.count({
      where: { status: { not: "STOPPED" } },
    });

    // Get task queue status
    const [pendingTasks, runningTasks, failedTasks, successTasks] = await Promise.all([
      prisma.generatorTask.count({ where: { status: "PENDING" } }),
      prisma.generatorTask.count({ where: { status: "RUNNING" } }),
      prisma.generatorTask.count({ where: { status: "FAILED" } }),
      prisma.generatorTask.count({ where: { status: "SUCCESS" } }),
    ]);

    // Get job queue status
    const [pendingJobs, runningJobs, completedJobs, failedJobs] = await Promise.all([
      prisma.generatorJob.count({ where: { status: "PENDING" } }),
      prisma.generatorJob.count({ where: { status: "RUNNING" } }),
      prisma.generatorJob.count({ where: { status: "COMPLETED" } }),
      prisma.generatorJob.count({ where: { status: "FAILED" } }),
    ]);

    return NextResponse.json({
      paused: pausedConfig?.value === "true",
      workerCount: parseInt(workerConfig?.value || "3", 10),
      activeRuns,
      activeWorkers,
      tasks: {
        pending: pendingTasks,
        running: runningTasks,
        failed: failedTasks,
        success: successTasks,
      },
      jobs: {
        pending: pendingJobs,
        running: runningJobs,
        completed: completedJobs,
        failed: failedJobs,
      },
    });
  } catch (error) {
    console.error("Generator control status error:", error);
    return NextResponse.json(
      { error: "Failed to get control status" },
      { status: 500 }
    );
  }
}
