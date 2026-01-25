import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseQueuesFile } from "@/lib/importers";
import { AccountStatus } from "@prisma/client";
import { getOrCreateEvent } from "@/lib/services/event-sync";
import { calculatePercentile } from "@/lib/analytics";

interface ImportError {
  email?: string;
  eventId?: string;
  reason: string;
  details?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const parseResult = parseQueuesFile(content);

    if (parseResult.data.length === 0) {
      return NextResponse.json(
        { 
          error: "No valid entries found in file",
          parseErrors: parseResult.errors.slice(0, 20),
        },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let eventsCreated = 0;
    let accountsCreated = 0;
    const importErrors: ImportError[] = [];

    // Get unique event IDs and create placeholder events using shared service
    const uniqueEventIds = [...new Set(parseResult.data.map(e => e.eventId))];
    
    for (const eventId of uniqueEventIds) {
      try {
        const result = await getOrCreateEvent(eventId);
        if (result.created) {
          eventsCreated++;
        }
      } catch (error) {
        console.error(`Failed to create event ${eventId}:`, error);
      }
    }

    // Import queue positions
    for (const entry of parseResult.data) {
      try {
        // Get or create account
        let account = await prisma.account.findUnique({
          where: { email: entry.email },
        });

        if (!account) {
          account = await prisma.account.create({
            data: {
              email: entry.email,
              status: AccountStatus.ACTIVE,
            },
          });
          accountsCreated++;
        }

        // Get event
        const event = await prisma.event.findUnique({
          where: { tmEventId: entry.eventId },
        });

        if (!event) {
          importErrors.push({
            email: entry.email,
            eventId: entry.eventId,
            reason: "Event not found",
            details: "Could not find or create event",
          });
          skipped++;
          continue;
        }

        // Upsert queue position (update if exists, create if not)
        const result = await prisma.queuePosition.upsert({
          where: {
            accountId_eventId: {
              accountId: account.id,
              eventId: event.id,
            },
          },
          update: {
            position: entry.position,
            testedAt: new Date(),
            source: file.name,
          },
          create: {
            accountId: account.id,
            eventId: event.id,
            position: entry.position,
            source: file.name,
          },
        });

        // Check if it was an update or create (compare testedAt with now)
        const isNew = result.testedAt.getTime() > Date.now() - 1000;
        if (isNew) {
          imported++;
        } else {
          updated++;
        }
      } catch (error) {
        importErrors.push({
          email: entry.email,
          eventId: entry.eventId,
          reason: "Database error",
          details: error instanceof Error ? error.message : String(error),
        });
        skipped++;
      }
    }

    // After import, calculate and store percentiles for all affected events
    // Uses same calculation as Queue Analytics for consistency
    for (const eventId of uniqueEventIds) {
      try {
        // Get the internal event ID
        const event = await prisma.event.findUnique({
          where: { tmEventId: eventId },
        });
        
        if (!event) continue;
        
        // Get all non-excluded positions for this event (sorted for percentile calc)
        const sortedPositions = await prisma.queuePosition.findMany({
          where: { eventId: event.id, excluded: false },
          select: { position: true },
          orderBy: { position: "asc" },
        });
        
        const positionValues = sortedPositions.map(p => p.position);
        const totalParticipants = positionValues.length;
        
        if (totalParticipants > 0) {
          // Get all positions for this event (including excluded for update)
          const allPositions = await prisma.queuePosition.findMany({
            where: { eventId: event.id },
            select: { id: true, position: true },
          });
          
          // Update each with calculated percentile (same method as Queue Analytics)
          for (const pos of allPositions) {
            const percentile = Math.round(calculatePercentile(pos.position, positionValues));
            await prisma.queuePosition.update({
              where: { id: pos.id },
              data: { percentile, totalParticipants },
            });
          }
        }
      } catch (error) {
        console.error(`Failed to calculate percentiles for event ${eventId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      eventsCreated,
      accountsCreated,
      total: parseResult.data.length,
      parseErrors: parseResult.errors.length,
      importErrors: importErrors.slice(0, 50),
      stats: parseResult.stats,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import file", details: String(error) },
      { status: 500 }
    );
  }
}
