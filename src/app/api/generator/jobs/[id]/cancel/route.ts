import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/generator/jobs/[id]/cancel
 * Cancel a pending or running job
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get the job
    const job = await prisma.generatorJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Only allow cancellation of PENDING or RUNNING jobs
    if (job.status !== "PENDING" && job.status !== "RUNNING") {
      return NextResponse.json(
        { error: `Cannot cancel a job with status: ${job.status}` },
        { status: 400 }
      );
    }

    // Update job status to CANCELLED
    const updatedJob = await prisma.generatorJob.update({
      where: { id },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });

    // Also cancel all pending tasks
    await prisma.generatorTask.updateMany({
      where: {
        jobId: id,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });

    return NextResponse.json({
      success: true,
      job: updatedJob,
      message: "Job cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling job:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
