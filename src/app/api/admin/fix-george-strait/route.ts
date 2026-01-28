import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/admin/fix-george-strait
 * 
 * Fixes George Strait events with correct dates
 */
export async function POST() {
  try {
    const logs: string[] = [];
    
    // First, find all George Strait events
    const existingEvents = await prisma.event.findMany({
      where: {
        OR: [
          { eventName: { contains: "George Strait", mode: "insensitive" } },
          { artistName: { contains: "George Strait", mode: "insensitive" } },
        ],
      },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    logs.push(`Found ${existingEvents.length} George Strait events:`);
    for (const e of existingEvents) {
      logs.push(`  - ${e.tmEventId}: "${e.eventName}" on ${e.eventDateRaw} (${e._count.purchases} purchases)`);
    }

    // Define the correct events
    const correctEvents = [
      {
        tmEventId: "3A006434086D4AB4",
        artistName: "George Strait",
        eventName: "George Strait",
        venue: "Moody Center ATX",
        eventDateRaw: "May 16, 2026 at 8:30 PM",
        dayOfWeek: "Sat",
      },
      {
        tmEventId: "3A00643408694AA4",
        artistName: "George Strait",
        eventName: "George Strait",
        venue: "Moody Center ATX",
        eventDateRaw: "May 15, 2026 at 8:30 PM",
        dayOfWeek: "Fri",
      },
    ];

    logs.push("\nTarget events:");
    for (const e of correctEvents) {
      logs.push(`  - ${e.tmEventId}: ${e.eventDateRaw}`);
    }

    // For each correct event, upsert it
    logs.push("\nUpdating events...");
    
    for (const eventData of correctEvents) {
      const existing = await prisma.event.findUnique({
        where: { tmEventId: eventData.tmEventId },
      });

      if (existing) {
        // Update existing event
        await prisma.event.update({
          where: { tmEventId: eventData.tmEventId },
          data: {
            artistName: eventData.artistName,
            eventName: eventData.eventName,
            venue: eventData.venue,
            eventDateRaw: eventData.eventDateRaw,
            dayOfWeek: eventData.dayOfWeek,
          },
        });
        logs.push(`  Updated: ${eventData.tmEventId} -> ${eventData.eventDateRaw}`);
      } else {
        // Create new event
        await prisma.event.create({
          data: {
            tmEventId: eventData.tmEventId,
            artistName: eventData.artistName,
            eventName: eventData.eventName,
            venue: eventData.venue,
            eventDateRaw: eventData.eventDateRaw,
            dayOfWeek: eventData.dayOfWeek,
          },
        });
        logs.push(`  Created: ${eventData.tmEventId} -> ${eventData.eventDateRaw}`);
      }
    }

    // Delete any OTHER George Strait events (not the two correct ones)
    const correctIds = correctEvents.map((e) => e.tmEventId);
    
    const toDelete = existingEvents.filter(
      (e) => !correctIds.includes(e.tmEventId)
    );

    if (toDelete.length > 0) {
      logs.push("\nDeleting incorrect events:");
      for (const e of toDelete) {
        if (e._count.purchases > 0) {
          logs.push(`  WARNING: ${e.tmEventId} has ${e._count.purchases} purchases - will unlink them`);
        }
        logs.push(`  Deleting: ${e.tmEventId} (${e.eventDateRaw})`);
      }

      await prisma.event.deleteMany({
        where: {
          tmEventId: { in: toDelete.map((e) => e.tmEventId) },
        },
      });
    }

    // Verify final state
    logs.push("\nFinal state:");
    const finalEvents = await prisma.event.findMany({
      where: {
        tmEventId: { in: correctIds },
      },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    for (const e of finalEvents) {
      logs.push(`  - ${e.tmEventId}: "${e.eventName}" on ${e.eventDateRaw} (${e._count.purchases} purchases)`);
    }

    logs.push("\nDone!");

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Fix George Strait error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
