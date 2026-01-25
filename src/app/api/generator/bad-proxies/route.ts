import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/bad-proxies
 * List all bad proxies with reason
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const skip = (page - 1) * limit;

    const [badProxies, total] = await Promise.all([
      prisma.generatorBadProxy.findMany({
        orderBy: { detectedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.generatorBadProxy.count(),
    ]);

    return NextResponse.json({
      badProxies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching bad proxies:", error);
    return NextResponse.json(
      { error: "Failed to fetch bad proxies" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/generator/bad-proxies
 * Permanently remove bad proxies
 * Body: { ids: string[] } or { all: true }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, all } = body;

    if (all) {
      const result = await prisma.generatorBadProxy.deleteMany({});
      return NextResponse.json({
        success: true,
        deleted: result.count,
        message: `Deleted ${result.count} bad proxy records`,
      });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Bad proxy IDs are required" },
        { status: 400 }
      );
    }

    const result = await prisma.generatorBadProxy.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} bad proxy records`,
    });
  } catch (error) {
    console.error("Error deleting bad proxies:", error);
    return NextResponse.json(
      { error: "Failed to delete bad proxies" },
      { status: 500 }
    );
  }
}
