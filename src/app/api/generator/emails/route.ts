import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/emails
 * List all emails in the pool with optional status filter
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: { status?: string } = {};
    if (status && ["AVAILABLE", "IN_USE", "USED"].includes(status)) {
      where.status = status;
    }

    // Get total count and stats
    const [emails, total, stats] = await Promise.all([
      prisma.generatorEmail.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.generatorEmail.count({ where }),
      prisma.generatorEmail.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    // Build stats object
    const statusCounts = {
      AVAILABLE: 0,
      IN_USE: 0,
      USED: 0,
    };
    for (const stat of stats) {
      if (stat.status in statusCounts) {
        statusCounts[stat.status as keyof typeof statusCounts] = stat._count;
      }
    }

    return NextResponse.json({
      emails,
      stats: statusCounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generator/emails
 * Bulk add emails to the pool (one per line)
 * 
 * Body:
 * - emails: string (newline-separated list of emails)
 * - imapProvider: string (optional, e.g., "aycd", "gmail")
 * 
 * Automatically filters out:
 * - Emails that already exist in the pool
 * - Emails that already exist as accounts in the database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emails, imapProvider } = body;

    if (!emails || typeof emails !== "string") {
      return NextResponse.json(
        { error: "Emails string is required" },
        { status: 400 }
      );
    }

    // Parse emails (one per line)
    const emailLines = emails
      .split("\n")
      .map((line: string) => line.trim().toLowerCase())
      .filter((line: string) => line.length > 0 && line.includes("@"));

    if (emailLines.length === 0) {
      return NextResponse.json(
        { error: "No valid emails provided" },
        { status: 400 }
      );
    }

    // Remove duplicates from input
    const uniqueEmails = [...new Set(emailLines)];

    // Check which emails already exist in the pool
    const existingInPool = await prisma.generatorEmail.findMany({
      where: { email: { in: uniqueEmails } },
      select: { email: true },
    });
    const existingPoolSet = new Set(existingInPool.map((e) => e.email));

    // Check which emails already exist as accounts in the database
    const existingAccounts = await prisma.account.findMany({
      where: { email: { in: uniqueEmails } },
      select: { email: true },
    });
    const existingAccountSet = new Set(existingAccounts.map((a) => a.email.toLowerCase()));

    // Filter to only new emails (not in pool and not already an account)
    const newEmails = uniqueEmails.filter(
      (email) => !existingPoolSet.has(email) && !existingAccountSet.has(email)
    );

    const skippedPool = existingPoolSet.size;
    const skippedAccount = existingAccountSet.size;

    if (newEmails.length === 0) {
      let message = "No new emails to add.";
      if (skippedPool > 0) message += ` ${skippedPool} already in pool.`;
      if (skippedAccount > 0) message += ` ${skippedAccount} already generated as accounts.`;
      
      return NextResponse.json({
        success: true,
        added: 0,
        skippedPool,
        skippedAccount,
        message,
      });
    }

    // Insert new emails with optional IMAP provider
    await prisma.generatorEmail.createMany({
      data: newEmails.map((email) => ({
        email,
        status: "AVAILABLE",
        imapProvider: imapProvider || null,
      })),
      skipDuplicates: true,
    });

    let message = `Added ${newEmails.length} emails to pool.`;
    if (skippedPool > 0) message += ` ${skippedPool} already in pool.`;
    if (skippedAccount > 0) message += ` ${skippedAccount} already generated as accounts.`;
    if (imapProvider) message += ` IMAP: ${imapProvider}`;

    return NextResponse.json({
      success: true,
      added: newEmails.length,
      skippedPool,
      skippedAccount,
      message,
    });
  } catch (error) {
    console.error("Error adding emails:", error);
    return NextResponse.json(
      { error: "Failed to add emails" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/generator/emails
 * Remove selected emails from the pool
 * Body: { ids: string[] } or { all: true, status?: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, all, status } = body;

    if (all) {
      // Delete all (optionally filtered by status)
      const where: { status?: string } = {};
      if (status && ["AVAILABLE", "IN_USE", "USED"].includes(status)) {
        where.status = status;
      }
      
      const result = await prisma.generatorEmail.deleteMany({ where });
      
      return NextResponse.json({
        success: true,
        deleted: result.count,
        message: `Deleted ${result.count} emails`,
      });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Email IDs are required" },
        { status: 400 }
      );
    }

    // Don't allow deleting IN_USE emails
    const result = await prisma.generatorEmail.deleteMany({
      where: {
        id: { in: ids },
        status: { not: "IN_USE" },
      },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} emails`,
    });
  } catch (error) {
    console.error("Error deleting emails:", error);
    return NextResponse.json(
      { error: "Failed to delete emails" },
      { status: 500 }
    );
  }
}
