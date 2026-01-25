import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            queuePositions: true,
            purchases: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: event.id,
      tmEventId: event.tmEventId,
      artistName: event.artistName,
      eventName: event.eventName,
      venue: event.venue,
      eventDate: event.eventDate,
      dayOfWeek: event.dayOfWeek,
      eventDateRaw: event.eventDateRaw,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      queuePositionCount: event._count.queuePositions,
      purchaseCount: event._count.purchases,
    });
  } catch (error) {
    console.error("Event fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event", details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { artistName, eventName, venue, eventDate, dayOfWeek, eventDateRaw, getInPriceUrl } = body;

    // Validate that event exists
    const existing = await prisma.event.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (artistName !== undefined) {
      updateData.artistName = artistName || null;
    }
    if (eventName !== undefined) {
      updateData.eventName = eventName;
    }
    if (venue !== undefined) {
      updateData.venue = venue;
    }
    if (eventDate !== undefined) {
      updateData.eventDate = eventDate ? new Date(eventDate) : null;
    }
    if (dayOfWeek !== undefined) {
      updateData.dayOfWeek = dayOfWeek || null;
    }
    if (eventDateRaw !== undefined) {
      updateData.eventDateRaw = eventDateRaw;
    }

    // Handle getInPriceUrl update via raw SQL (in case Prisma client not regenerated)
    if (getInPriceUrl !== undefined) {
      await prisma.$executeRaw`
        UPDATE events SET 
          get_in_price_url = ${getInPriceUrl || null},
          updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    const updated = await prisma.event.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      event: {
        id: updated.id,
        tmEventId: updated.tmEventId,
        artistName: updated.artistName,
        eventName: updated.eventName,
        venue: updated.venue,
        eventDate: updated.eventDate,
        dayOfWeek: updated.dayOfWeek,
        eventDateRaw: updated.eventDateRaw,
      },
    });
  } catch (error) {
    console.error("Event update error:", error);
    return NextResponse.json(
      { error: "Failed to update event", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.event.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            queuePositions: true,
            purchases: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Delete the event (cascades to queue positions, sets null on purchases)
    await prisma.event.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      deletedEventName: existing.eventName,
      deletedQueuePositions: existing._count.queuePositions,
    });
  } catch (error) {
    console.error("Event delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete event", details: String(error) },
      { status: 500 }
    );
  }
}
