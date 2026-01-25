import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/checkout/runs
 * Fetch checkout worker runs with stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const skip = (page - 1) * limit;
    const status = searchParams.get("status");

    // Build where clause
    const where: { status?: string } = {};
    if (status) {
      where.status = status.toUpperCase();
    }

    // Get total count
    const total = await prisma.checkoutRun.count({ where });

    // Get runs with job counts
    const runs = await prisma.checkoutRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: {
          select: { jobs: true },
        },
      },
    });

    return NextResponse.json({
      runs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching checkout runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch checkout runs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/checkout/runs
 * Create a new checkout run (worker session)
 * 
 * Body:
 * - workerId: string (required, unique identifier for the worker)
 * - notes: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId, notes } = body;

    if (!workerId || typeof workerId !== "string") {
      return NextResponse.json(
        { error: "Worker ID is required" },
        { status: 400 }
      );
    }

    // Create new run
    const run = await prisma.checkoutRun.create({
      data: {
        workerId,
        status: "RUNNING",
        notes: notes || null,
      },
    });

    return NextResponse.json({
      success: true,
      run,
    });
  } catch (error) {
    console.error("Error creating checkout run:", error);
    return NextResponse.json(
      { error: "Failed to create checkout run" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/checkout/runs
 * Update a run's status and stats (by runId in body)
 * 
 * Body:
 * - runId: string (required)
 * - status: "RUNNING" | "COMPLETED" | "ABORTED"
 * - jobsSuccess: number (optional, to increment)
 * - jobsFailed: number (optional, to increment)
 * - jobsReview: number (optional, to increment)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { runId, status, jobsSuccess, jobsFailed, jobsReview, notes } = body;

    if (!runId) {
      return NextResponse.json(
        { error: "Run ID is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.checkoutRun.findUnique({
      where: { id: runId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      const validStatuses = ["RUNNING", "COMPLETED", "ABORTED"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = status;

      if (["COMPLETED", "ABORTED"].includes(status)) {
        updateData.endedAt = new Date();
      }
    }

    // Increment stats
    if (typeof jobsSuccess === "number" && jobsSuccess > 0) {
      updateData.jobsSuccess = { increment: jobsSuccess };
    }
    if (typeof jobsFailed === "number" && jobsFailed > 0) {
      updateData.jobsFailed = { increment: jobsFailed };
    }
    if (typeof jobsReview === "number" && jobsReview > 0) {
      updateData.jobsReview = { increment: jobsReview };
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const run = await prisma.checkoutRun.update({
      where: { id: runId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      run,
    });
  } catch (error) {
    console.error("Error updating checkout run:", error);
    return NextResponse.json(
      { error: "Failed to update checkout run" },
      { status: 500 }
    );
  }
}
