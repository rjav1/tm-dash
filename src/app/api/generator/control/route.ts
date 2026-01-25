import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/generator/control
 * 
 * Control endpoint for generator worker operations.
 * Provides TUI-equivalent functionality for the dashboard.
 * 
 * Actions:
 * - pause: Pause all workers (sets paused flag in config)
 * - resume: Resume all workers (clears paused flag)
 * - skip: Skip all running jobs (marks as CANCELLED)
 * - clear: Clear all pending jobs from queue
 * - retry_all: Retry all failed jobs (requeue them)
 * - cancel_job: Cancel a specific job by ID
 * - scale_workers: Change the number of workers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobId, workerCount } = body;

    switch (action) {
      case "pause": {
        // Set paused flag in config
        await prisma.generatorConfig.upsert({
          where: { key: "paused" },
          update: { value: "true" },
          create: { key: "paused", value: "true" },
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
        return NextResponse.json({
          success: true,
          message: "Generator workers resumed",
          paused: false,
        });
      }

      case "skip": {
        // Cancel all RUNNING jobs
        const skipResult = await prisma.generatorJob.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
          },
        });
        
        // Also cancel all running tasks
        await prisma.generatorTask.updateMany({
          where: { status: "RUNNING" },
          data: {
            status: "FAILED",
            completedAt: new Date(),
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
        // For generator, retry means requeue failed tasks
        const retryResult = await prisma.generatorTask.updateMany({
          where: {
            status: "FAILED",
          },
          data: {
            status: "PENDING",
            startedAt: null,
            completedAt: null,
            errorMessage: null,
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
          },
        });
        
        return NextResponse.json({
          success: true,
          message: "Job cancelled",
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
        
        await prisma.generatorConfig.upsert({
          where: { key: "worker_count" },
          update: { value: String(workerCount) },
          create: { key: "worker_count", value: String(workerCount) },
        });
        
        return NextResponse.json({
          success: true,
          message: `Worker count set to ${workerCount}`,
          workerCount,
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
      prisma.generatorConfig.findUnique({ where: { key: "worker_count" } }),
    ]);

    // Get queue status
    const [pendingCount, processingCount, failedCount, successCount] = await Promise.all([
      prisma.generatorJob.count({ where: { status: "PENDING" } }),
      prisma.generatorJob.count({ where: { status: "PROCESSING" } }),
      prisma.generatorJob.count({ where: { status: "FAILED" } }),
      prisma.generatorJob.count({ where: { status: "SUCCESS" } }),
    ]);

    return NextResponse.json({
      paused: pausedConfig?.value === "true",
      workerCount: parseInt(workerConfig?.value || "1", 10),
      queue: {
        pending: pendingCount,
        processing: processingCount,
        failed: failedCount,
        success: successCount,
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
