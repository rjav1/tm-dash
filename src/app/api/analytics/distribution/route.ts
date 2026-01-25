import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  calculateDistributionStats,
  detectTiersGapBased,
  detectTiersJenks,
  getHistogramData,
  getScatterData,
} from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId") || "";
    const method = searchParams.get("method") || "gap"; // "gap" or "jenks"
    const maxTiers = parseInt(searchParams.get("maxTiers") || "4", 10);
    const bucketCount = parseInt(searchParams.get("buckets") || "20", 10);

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 }
      );
    }

    const includeExcluded = searchParams.get("includeExcluded") === "true";

    // Get queue positions for this event (optionally including excluded)
    const [activePositions, excludedPositions] = await Promise.all([
      prisma.queuePosition.findMany({
        where: { eventId, excluded: false },
        select: { id: true, position: true },
        orderBy: { position: "asc" },
      }),
      prisma.queuePosition.findMany({
        where: { eventId, excluded: true },
        select: { id: true, position: true, excludedReason: true },
        orderBy: { position: "asc" },
      }),
    ]);

    if (activePositions.length === 0 && excludedPositions.length === 0) {
      return NextResponse.json({
        eventId,
        stats: null,
        tierDetection: null,
        histogram: [],
        scatter: [],
        excludedScatter: [],
        excludedCount: 0,
        message: "No queue positions found for this event",
      });
    }

    const positions = activePositions.map(q => q.position);

    // Calculate distribution stats
    const stats = calculateDistributionStats(positions);

    // Detect tiers using selected method
    const tierDetection = method === "jenks"
      ? detectTiersJenks(positions, maxTiers)
      : detectTiersGapBased(positions, maxTiers);

    // Get visualization data
    const histogram = getHistogramData(positions, bucketCount);
    const scatter = getScatterData(positions);

    // Get event details
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, eventName: true, tmEventId: true },
    });

    // Create scatter data for excluded positions too (for visualization)
    const excludedScatter = excludedPositions.map((q, index) => ({
      id: q.id,
      rank: index + 1, // Rank among excluded
      position: q.position,
      excluded: true,
      reason: q.excludedReason,
    }));

    return NextResponse.json({
      eventId,
      event,
      stats: {
        count: stats.count,
        min: stats.min,
        max: stats.max,
        mean: Math.round(stats.mean),
        median: Math.round(stats.median),
        stdDev: Math.round(stats.stdDev),
        range: stats.range,
      },
      tierDetection: {
        distributionType: tierDetection.distributionType,
        linearityScore: Math.round(tierDetection.linearityScore * 100) / 100,
        message: tierDetection.message,
        tierLabels: tierDetection.tierLabels,
        boundaries: tierDetection.boundaries.map(b => ({
          position: b.position,
          gapSize: b.gapSize,
          accountsAbove: b.accountsAbove,
        })),
      },
      histogram,
      scatter: scatter.length > 500
        ? scatter.filter((_, i) => i % Math.ceil(scatter.length / 500) === 0) // Downsample for large datasets
        : scatter,
      excludedScatter,
      excludedCount: excludedPositions.length,
    });
  } catch (error) {
    console.error("Distribution analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze distribution", details: String(error) },
      { status: 500 }
    );
  }
}
