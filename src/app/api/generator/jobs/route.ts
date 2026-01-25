import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/jobs
 * Fetch paginated list of generator jobs with their tasks
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
      where.status = status;
    }

    // Get total count
    const total = await prisma.generatorJob.count({ where });

    // Get jobs with task counts
    const jobs = await prisma.generatorJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching generator jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generator/jobs
 * Create a new generator job with tasks
 * 
 * Body:
 * - emails: string (one email,imap per line)
 * - proxies: string (one proxy per line)
 * - threadCount: number (1-10)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emails, proxies, threadCount = 1 } = body;

    if (!emails || typeof emails !== "string") {
      return NextResponse.json(
        { error: "Emails are required" },
        { status: 400 }
      );
    }

    // Parse emails (format: email,imap per line)
    const emailLines = emails
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    if (emailLines.length === 0) {
      return NextResponse.json(
        { error: "No valid emails provided" },
        { status: 400 }
      );
    }

    // Parse proxies (one per line)
    const proxyList = proxies
      ? proxies
          .split("\n")
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
      : [];

    // Create tasks from emails
    const tasks = emailLines.map((line: string, index: number) => {
      const parts = line.split(",");
      const email = parts[0]?.trim() || "";
      const imapSource = parts[1]?.trim() || "aycd";
      // Assign proxies round-robin if available
      const proxy = proxyList.length > 0 ? proxyList[index % proxyList.length] : null;

      return {
        email,
        imapSource,
        proxy,
        status: "PENDING",
      };
    });

    // Validate thread count
    const validThreadCount = Math.max(1, Math.min(10, threadCount));

    // Create job with tasks in a transaction
    const job = await prisma.generatorJob.create({
      data: {
        status: "PENDING",
        threadCount: validThreadCount,
        totalTasks: tasks.length,
        tasks: {
          create: tasks,
        },
      },
      include: {
        tasks: true,
        _count: {
          select: { tasks: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      job,
      message: `Created job with ${tasks.length} tasks`,
    });
  } catch (error) {
    console.error("Error creating generator job:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
