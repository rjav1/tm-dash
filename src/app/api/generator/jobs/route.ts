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

    // Get jobs with task counts and tag
    const jobs = await prisma.generatorJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        tag: true,
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
 * Create a new generator job using emails and proxies from pools
 * 
 * Body:
 * - emailCount: number (how many emails to use from pool)
 * - imapProvider: "aycd" | "gmail" (which IMAP provider to use)
 * - autoImport: boolean (auto-import successful accounts, default false)
 * - threadCount: number (1-10)
 * - tagId: string (optional, tag to apply to generated accounts)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      emailCount, 
      imapProvider = "aycd", 
      autoImport = false,
      threadCount = 1, 
      tagId 
    } = body;

    // Validate email count
    if (!emailCount || typeof emailCount !== "number" || emailCount < 1) {
      return NextResponse.json(
        { error: "Email count must be at least 1" },
        { status: 400 }
      );
    }

    // Validate IMAP provider
    if (!["aycd", "gmail"].includes(imapProvider)) {
      return NextResponse.json(
        { error: "IMAP provider must be 'aycd' or 'gmail'" },
        { status: 400 }
      );
    }

    // Get available emails from pool
    const availableEmails = await prisma.generatorEmail.findMany({
      where: { status: "AVAILABLE" },
      orderBy: { createdAt: "asc" },
      take: emailCount,
    });

    if (availableEmails.length === 0) {
      return NextResponse.json(
        { error: "No available emails in pool. Add emails first." },
        { status: 400 }
      );
    }

    if (availableEmails.length < emailCount) {
      return NextResponse.json(
        { 
          error: `Only ${availableEmails.length} emails available in pool, requested ${emailCount}`,
          available: availableEmails.length,
        },
        { status: 400 }
      );
    }

    // Get available proxies from pool (ordered by use count for round-robin)
    const availableProxies = await prisma.generatorProxy.findMany({
      where: { status: "AVAILABLE" },
      orderBy: [
        { useCount: "asc" },
        { lastUsedAt: "asc" },
      ],
    });

    // Validate thread count
    const validThreadCount = Math.max(1, Math.min(10, threadCount));

    // Validate tag if provided
    if (tagId) {
      const tagExists = await prisma.accountTag.findUnique({
        where: { id: tagId },
      });
      if (!tagExists) {
        return NextResponse.json(
          { error: "Tag not found" },
          { status: 400 }
        );
      }
    }

    // Create tasks from selected emails with round-robin proxy assignment
    const tasks = availableEmails.map((emailRecord, index) => {
      // Assign proxy round-robin if available
      const proxyRecord = availableProxies.length > 0 
        ? availableProxies[index % availableProxies.length] 
        : null;

      return {
        email: emailRecord.email,
        imapSource: imapProvider,
        proxy: proxyRecord?.proxy || null,
        status: "PENDING",
      };
    });

    // Use transaction to create job and update email/proxy statuses
    const job = await prisma.$transaction(async (tx) => {
      // Mark emails as IN_USE
      await tx.generatorEmail.updateMany({
        where: { id: { in: availableEmails.map((e) => e.id) } },
        data: { status: "IN_USE" },
      });

      // Update proxy use counts
      if (availableProxies.length > 0) {
        const proxyUseCount: Record<string, number> = {};
        for (let i = 0; i < availableEmails.length; i++) {
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

      // Create the job with tasks
      return tx.generatorJob.create({
        data: {
          status: "PENDING",
          threadCount: validThreadCount,
          totalTasks: tasks.length,
          imapProvider,
          autoImport,
          tagId: tagId || null,
          tasks: {
            create: tasks,
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
      job,
      message: `Created job with ${tasks.length} tasks`,
      proxiesUsed: availableProxies.length,
    });
  } catch (error) {
    console.error("Error creating generator job:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
