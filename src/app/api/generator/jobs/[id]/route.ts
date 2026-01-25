import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/generator/jobs/[id]
 * Get a single job with all its tasks
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const job = await prisma.generatorJob.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/generator/jobs/[id]
 * Delete a job and all its tasks
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if job exists
    const job = await prisma.generatorJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Don't allow deletion of running jobs
    if (job.status === "RUNNING") {
      return NextResponse.json(
        { error: "Cannot delete a running job. Cancel it first." },
        { status: 400 }
      );
    }

    // Delete the job (tasks will cascade delete)
    await prisma.generatorJob.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting job:", error);
    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }
}
