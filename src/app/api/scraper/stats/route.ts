import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export interface ScraperStats {
  isOnline: boolean;
  hasRecentErrors: boolean;  // True if recent jobs have failed
  lastError: string | null;  // Most recent error message
  currentRun: {
    id: string;
    workerId: string;
    status: string;
    startedAt: string;
    lastHeartbeat: string;
    jobsSuccess: number;
    jobsFailed: number;
  } | null;
  recentJobs: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    errorMessage: string | null;
  }>;
  queuedJobsCount: number;
}

/**
 * GET /api/scraper/stats
 * 
 * Returns the current status of the VPS scraper daemon
 */
export async function GET() {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30000);

    // Find active run with recent heartbeat
    const activeRun = await prisma.scrapeRun.findFirst({
      where: {
        status: "RUNNING",
        lastHeartbeat: { gte: thirtySecondsAgo },
      },
      orderBy: { lastHeartbeat: "desc" },
    });

    // Get recent jobs (including error messages)
    const recentJobs = await prisma.scrapeJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    });

    // Count queued jobs
    const queuedJobsCount = await prisma.scrapeJob.count({
      where: { status: "QUEUED" },
    });

    // Check for recent errors (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentFailedJobs = recentJobs.filter(
      (job) =>
        job.status === "FAILED" &&
        job.completedAt &&
        new Date(job.completedAt) > fiveMinutesAgo
    );
    const hasRecentErrors = recentFailedJobs.length > 0;
    const lastError = recentFailedJobs[0]?.errorMessage || null;

    const stats: ScraperStats = {
      isOnline: !!activeRun,
      hasRecentErrors,
      lastError,
      currentRun: activeRun
        ? {
            id: activeRun.id,
            workerId: activeRun.workerId,
            status: activeRun.status,
            startedAt: activeRun.startedAt.toISOString(),
            lastHeartbeat: activeRun.lastHeartbeat.toISOString(),
            jobsSuccess: activeRun.jobsSuccess,
            jobsFailed: activeRun.jobsFailed,
          }
        : null,
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() || null,
        errorMessage: job.errorMessage,
      })),
      queuedJobsCount,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching scraper stats:", error);
    return NextResponse.json(
      {
        isOnline: false,
        hasRecentErrors: false,
        lastError: null,
        currentRun: null,
        recentJobs: [],
        queuedJobsCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
