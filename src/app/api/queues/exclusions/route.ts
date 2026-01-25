import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/queues/exclusions
 * Bulk exclude or include queue positions
 * 
 * Body: {
 *   action: "exclude" | "include",
 *   queuePositionIds?: string[],   // Specific IDs to exclude/include
 *   eventId?: string,              // For range-based selection
 *   positionRange?: { min: number, max: number }, // Position range to exclude
 *   reason?: string                // Why excluding (for audit)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      action, 
      queuePositionIds, 
      eventId, 
      positionRange, 
      reason = "Manual exclusion" 
    } = body;

    if (!action || !["exclude", "include"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'exclude' or 'include'" },
        { status: 400 }
      );
    }

    let whereClause: Record<string, unknown> = {};

    // Build where clause based on selection method
    if (queuePositionIds && queuePositionIds.length > 0) {
      // Specific IDs provided
      whereClause.id = { in: queuePositionIds };
    } else if (eventId && positionRange) {
      // Range-based selection for an event
      whereClause = {
        eventId,
        position: {
          gte: positionRange.min,
          lte: positionRange.max,
        },
      };
    } else {
      return NextResponse.json(
        { error: "Must provide queuePositionIds OR (eventId + positionRange)" },
        { status: 400 }
      );
    }

    // Perform the update
    const result = await prisma.queuePosition.updateMany({
      where: whereClause,
      data: action === "exclude"
        ? {
            excluded: true,
            excludedAt: new Date(),
            excludedReason: reason,
          }
        : {
            excluded: false,
            excludedAt: null,
            excludedReason: null,
          },
    });

    return NextResponse.json({
      success: true,
      action,
      updated: result.count,
      message: `${action === "exclude" ? "Excluded" : "Included"} ${result.count} queue position(s)`,
    });
  } catch (error) {
    console.error("Queue exclusion error:", error);
    return NextResponse.json(
      { error: "Failed to update exclusions", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/queues/exclusions
 * Get excluded queue positions (optionally filtered by event)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");

    const whereClause: Record<string, unknown> = { excluded: true };
    if (eventId) {
      whereClause.eventId = eventId;
    }

    const excluded = await prisma.queuePosition.findMany({
      where: whereClause,
      include: {
        account: { select: { email: true } },
        event: { select: { eventName: true } },
      },
      orderBy: { excludedAt: "desc" },
    });

    // Also get counts per event
    const countsByEvent = await prisma.queuePosition.groupBy({
      by: ["eventId"],
      where: { excluded: true },
      _count: { id: true },
    });

    return NextResponse.json({
      excluded: excluded.map(q => ({
        id: q.id,
        email: q.account.email,
        eventName: q.event.eventName,
        position: q.position,
        excludedAt: q.excludedAt,
        excludedReason: q.excludedReason,
      })),
      countsByEvent,
      totalExcluded: excluded.length,
    });
  } catch (error) {
    console.error("Fetch exclusions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exclusions", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/queues/exclusions
 * Reset all exclusions for an event (or all events)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const confirm = searchParams.get("confirm");

    if (confirm !== "yes") {
      return NextResponse.json(
        { error: "Add ?confirm=yes to confirm reset" },
        { status: 400 }
      );
    }

    const whereClause: Record<string, unknown> = { excluded: true };
    if (eventId) {
      whereClause.eventId = eventId;
    }

    const result = await prisma.queuePosition.updateMany({
      where: whereClause,
      data: {
        excluded: false,
        excludedAt: null,
        excludedReason: null,
      },
    });

    return NextResponse.json({
      success: true,
      restored: result.count,
      message: `Restored ${result.count} previously excluded position(s)`,
    });
  } catch (error) {
    console.error("Reset exclusions error:", error);
    return NextResponse.json(
      { error: "Failed to reset exclusions", details: String(error) },
      { status: 500 }
    );
  }
}
