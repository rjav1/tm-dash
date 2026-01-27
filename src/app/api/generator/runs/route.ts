import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/runs
 * Get list of generator run sessions with pagination
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - status: "RUNNING" | "COMPLETED" | "ABORTED" (optional, filter by status)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const status = searchParams.get("status");
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [runs, totalCount] = await Promise.all([
      prisma.generatorRun.findMany({
        where,
        include: {
          workers: {
            select: {
              id: true,
              workerName: true,
              status: true,
              tasksCompleted: true,
              tasksFailed: true,
              lastHeartbeat: true,
            },
          },
          _count: {
            select: { jobs: true },
          },
        },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.generatorRun.count({ where }),
    ]);

    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);

    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        workerId: run.workerId,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        endedAt: run.endedAt?.toISOString() || null,
        lastHeartbeat: run.lastHeartbeat?.toISOString() || null,
        activeWorkerCount: run.activeWorkerCount,
        jobsSuccess: run.jobsSuccess,
        jobsFailed: run.jobsFailed,
        tasksSuccess: run.tasksSuccess,
        tasksFailed: run.tasksFailed,
        notes: run.notes,
        jobsProcessed: run._count.jobs,
        isStale: run.status === "RUNNING" && (!run.lastHeartbeat || run.lastHeartbeat < thirtySecondsAgo),
        workers: run.workers.map((worker) => ({
          id: worker.id,
          workerName: worker.workerName,
          status: worker.status,
          tasksCompleted: worker.tasksCompleted,
          tasksFailed: worker.tasksFailed,
          lastHeartbeat: worker.lastHeartbeat.toISOString(),
          isStale: worker.lastHeartbeat < thirtySecondsAgo,
        })),
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + runs.length < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching generator runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch generator runs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generator/runs
 * Create a new generator run session (for manual start from dashboard)
 * 
 * Body:
 * - workerId: string (machine identifier)
 * - notes: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId, notes } = body;

    if (!workerId) {
      return NextResponse.json(
        { error: "workerId is required" },
        { status: 400 }
      );
    }

    // Create new run
    const run = await prisma.generatorRun.create({
      data: {
        workerId,
        status: "RUNNING",
        notes: notes || null,
        activeWorkerCount: 0,
      },
    });

    return NextResponse.json({
      success: true,
      run: {
        id: run.id,
        workerId: run.workerId,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        notes: run.notes,
      },
    });
  } catch (error) {
    console.error("Error creating generator run:", error);
    return NextResponse.json(
      { error: "Failed to create generator run" },
      { status: 500 }
    );
  }
}
