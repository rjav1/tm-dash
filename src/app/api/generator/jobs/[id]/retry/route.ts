import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/generator/jobs/[id]/retry
 * Create a new job from failed tasks
 * 
 * Body:
 * - taskIds: string[] (specific failed tasks to retry)
 * - allFailed: boolean (retry all failed tasks from this job)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: jobId } = await params;
    const body = await request.json();
    const { taskIds, allFailed } = body;

    // Get the original job
    const originalJob = await prisma.generatorJob.findUnique({
      where: { id: jobId },
      include: { tag: true },
    });

    if (!originalJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get failed tasks
    let failedTasks;
    if (allFailed) {
      failedTasks = await prisma.generatorTask.findMany({
        where: {
          jobId,
          status: "FAILED",
        },
      });
    } else if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
      failedTasks = await prisma.generatorTask.findMany({
        where: {
          id: { in: taskIds },
          jobId,
          status: "FAILED",
        },
      });
    } else {
      return NextResponse.json(
        { error: "Task IDs or 'allFailed' flag is required" },
        { status: 400 }
      );
    }

    if (failedTasks.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No failed tasks to retry",
      }, { status: 400 });
    }

    // Get available proxies for the new job
    const availableProxies = await prisma.generatorProxy.findMany({
      where: { status: "AVAILABLE" },
      orderBy: [
        { useCount: "asc" },
        { lastUsedAt: "asc" },
      ],
    });

    // Create tasks for the new job with round-robin proxy assignment
    const newTasks = failedTasks.map((task, index) => {
      const proxyRecord = availableProxies.length > 0 
        ? availableProxies[index % availableProxies.length] 
        : null;

      return {
        email: task.email,
        imapSource: task.imapSource,
        proxy: proxyRecord?.proxy || null,
        status: "PENDING",
      };
    });

    // Create the new job
    const newJob = await prisma.$transaction(async (tx) => {
      // Reset email status back to IN_USE for retry
      await tx.generatorEmail.updateMany({
        where: { 
          email: { in: failedTasks.map((t) => t.email) },
          status: "USED",
        },
        data: { status: "IN_USE" },
      });

      // Update proxy use counts
      if (availableProxies.length > 0) {
        const proxyUseCount: Record<string, number> = {};
        for (let i = 0; i < failedTasks.length; i++) {
          const proxyId = availableProxies[i % availableProxies.length].id;
          proxyUseCount[proxyId] = (proxyUseCount[proxyId] || 0) + 1;
        }

        for (const [proxyId, count] of Object.entries(proxyUseCount)) {
          await tx.generatorProxy.update({
            where: { id: proxyId },
            data: {
              useCount: { increment: count },
              lastUsedAt: new Date(),
            },
          });
        }
      }

      // Create the new job
      return tx.generatorJob.create({
        data: {
          status: "PENDING",
          threadCount: originalJob.threadCount,
          totalTasks: newTasks.length,
          imapProvider: originalJob.imapProvider,
          autoImport: originalJob.autoImport,
          tagId: originalJob.tagId,
          tasks: {
            create: newTasks,
          },
        },
        include: {
          tag: true,
          _count: {
            select: { tasks: true },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      job: newJob,
      retriedCount: failedTasks.length,
      message: `Created retry job with ${failedTasks.length} tasks`,
    });
  } catch (error) {
    console.error("Error creating retry job:", error);
    return NextResponse.json(
      { error: "Failed to create retry job" },
      { status: 500 }
    );
  }
}
