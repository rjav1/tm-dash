import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/proxies
 * List all proxies in the pool with optional status filter
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
    if (status && ["AVAILABLE", "IN_USE", "BAD"].includes(status)) {
      where.status = status;
    }

    // Get total count and stats
    const [proxies, total, stats] = await Promise.all([
      prisma.generatorProxy.findMany({
        where,
        orderBy: [
          { useCount: "asc" },
          { lastUsedAt: "asc" },
        ],
        skip,
        take: limit,
      }),
      prisma.generatorProxy.count({ where }),
      prisma.generatorProxy.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    // Build stats object
    const statusCounts = {
      AVAILABLE: 0,
      IN_USE: 0,
      BAD: 0,
    };
    for (const stat of stats) {
      if (stat.status in statusCounts) {
        statusCounts[stat.status as keyof typeof statusCounts] = stat._count;
      }
    }

    return NextResponse.json({
      proxies,
      stats: statusCounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching proxies:", error);
    return NextResponse.json(
      { error: "Failed to fetch proxies" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generator/proxies
 * Bulk add proxies to the pool (one per line)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { proxies } = body;

    if (!proxies || typeof proxies !== "string") {
      return NextResponse.json(
        { error: "Proxies string is required" },
        { status: 400 }
      );
    }

    // Parse proxies (one per line)
    const proxyLines = proxies
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    if (proxyLines.length === 0) {
      return NextResponse.json(
        { error: "No valid proxies provided" },
        { status: 400 }
      );
    }

    // Remove duplicates
    const uniqueProxies = [...new Set(proxyLines)];

    // Check which proxies already exist
    const existing = await prisma.generatorProxy.findMany({
      where: { proxy: { in: uniqueProxies } },
      select: { proxy: true },
    });
    const existingSet = new Set(existing.map((p) => p.proxy));

    // Filter to only new proxies
    const newProxies = uniqueProxies.filter((proxy) => !existingSet.has(proxy));

    if (newProxies.length === 0) {
      return NextResponse.json({
        success: true,
        added: 0,
        skipped: uniqueProxies.length,
        message: "All proxies already exist in the pool",
      });
    }

    // Insert new proxies
    await prisma.generatorProxy.createMany({
      data: newProxies.map((proxy) => ({
        proxy,
        status: "AVAILABLE",
        useCount: 0,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      added: newProxies.length,
      skipped: existingSet.size,
      message: `Added ${newProxies.length} proxies to pool`,
    });
  } catch (error) {
    console.error("Error adding proxies:", error);
    return NextResponse.json(
      { error: "Failed to add proxies" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/generator/proxies
 * Remove selected proxies from the pool
 * Body: { ids: string[] } or { all: true, status?: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, all, status } = body;

    if (all) {
      // Delete all (optionally filtered by status)
      const where: { status?: string } = {};
      if (status && ["AVAILABLE", "IN_USE", "BAD"].includes(status)) {
        where.status = status;
      }
      
      const result = await prisma.generatorProxy.deleteMany({ where });
      
      return NextResponse.json({
        success: true,
        deleted: result.count,
        message: `Deleted ${result.count} proxies`,
      });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Proxy IDs are required" },
        { status: 400 }
      );
    }

    // Don't allow deleting IN_USE proxies
    const result = await prisma.generatorProxy.deleteMany({
      where: {
        id: { in: ids },
        status: { not: "IN_USE" },
      },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} proxies`,
    });
  } catch (error) {
    console.error("Error deleting proxies:", error);
    return NextResponse.json(
      { error: "Failed to delete proxies" },
      { status: 500 }
    );
  }
}
