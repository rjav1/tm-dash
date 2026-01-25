import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/generator/bad-proxies/restore
 * Restore bad proxies back to the available pool
 * Body: { ids: string[] } or { all: true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, all } = body;

    let badProxies;

    if (all) {
      badProxies = await prisma.generatorBadProxy.findMany({
        select: { id: true, proxy: true },
      });
    } else if (ids && Array.isArray(ids) && ids.length > 0) {
      badProxies = await prisma.generatorBadProxy.findMany({
        where: { id: { in: ids } },
        select: { id: true, proxy: true },
      });
    } else {
      return NextResponse.json(
        { error: "Bad proxy IDs are required" },
        { status: 400 }
      );
    }

    if (badProxies.length === 0) {
      return NextResponse.json({
        success: true,
        restored: 0,
        message: "No bad proxies to restore",
      });
    }

    // Upsert proxies back to available pool
    let restoredCount = 0;
    for (const bp of badProxies) {
      try {
        await prisma.generatorProxy.upsert({
          where: { proxy: bp.proxy },
          update: { status: "AVAILABLE" },
          create: {
            proxy: bp.proxy,
            status: "AVAILABLE",
            useCount: 0,
          },
        });
        restoredCount++;
      } catch {
        // Skip if proxy already exists with different status
      }
    }

    // Delete from bad proxies table
    await prisma.generatorBadProxy.deleteMany({
      where: { id: { in: badProxies.map((bp) => bp.id) } },
    });

    return NextResponse.json({
      success: true,
      restored: restoredCount,
      message: `Restored ${restoredCount} proxies to available pool`,
    });
  } catch (error) {
    console.error("Error restoring bad proxies:", error);
    return NextResponse.json(
      { error: "Failed to restore bad proxies" },
      { status: 500 }
    );
  }
}
