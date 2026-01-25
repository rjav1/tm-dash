/**
 * One-time script to fix event data and remove test events
 * 
 * Run with: npx tsx scripts/fix-events.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting event data fix...\n");

  // 1. Fix the 3 events with correct data
  const eventFixes = [
    {
      tmEventId: "0A006426C2444B31",
      artistName: "Bruno Mars",
      eventName: "Bruno Mars - The Romantic...",
      venue: "SoFi Stadium",
      dayOfWeek: "Wed",
      eventDate: new Date("2026-10-07T22:00:00"), // Wed Oct 7, 2026
      eventDateRaw: "October 07, 2026 at 10:00 PM",
    },
    {
      tmEventId: "10006430621E2612",
      artistName: "Bruno Mars",
      eventName: "Bruno Mars",
      venue: "Rogers Stadium",
      dayOfWeek: "Sat",
      eventDate: new Date("2026-05-30T19:00:00"), // Sat May 30, 2026
      eventDateRaw: "May 30, 2026 at 07:00 PM",
    },
    {
      tmEventId: "1900642D2342860F",
      artistName: "Madisoneer",
      eventName: "Madisoneer",
      venue: "Arizona Financial Theatre",
      dayOfWeek: "Sat",
      eventDate: new Date("2026-06-20T20:00:00"), // Sat Jun 20, 2026
      eventDateRaw: "June 20, 2026 at 08:00 PM",
    },
  ];

  for (const fix of eventFixes) {
    try {
      const existing = await prisma.event.findUnique({
        where: { tmEventId: fix.tmEventId },
      });

      if (existing) {
        await prisma.event.update({
          where: { tmEventId: fix.tmEventId },
          data: {
            artistName: fix.artistName,
            eventName: fix.eventName,
            venue: fix.venue,
            dayOfWeek: fix.dayOfWeek,
            eventDate: fix.eventDate,
            eventDateRaw: fix.eventDateRaw,
          },
        });
        console.log(`✓ Updated event: ${fix.artistName} at ${fix.venue} (${fix.tmEventId})`);
      } else {
        // Create if doesn't exist
        await prisma.event.create({
          data: {
            tmEventId: fix.tmEventId,
            artistName: fix.artistName,
            eventName: fix.eventName,
            venue: fix.venue,
            dayOfWeek: fix.dayOfWeek,
            eventDate: fix.eventDate,
            eventDateRaw: fix.eventDateRaw,
          },
        });
        console.log(`✓ Created event: ${fix.artistName} at ${fix.venue} (${fix.tmEventId})`);
      }
    } catch (error) {
      console.error(`✗ Failed to update/create ${fix.tmEventId}:`, error);
    }
  }

  console.log("\n---\n");

  // 2. Find and delete Lady Gaga test events
  const ladyGagaEvents = await prisma.event.findMany({
    where: {
      OR: [
        { eventName: { contains: "Lady Gaga", mode: "insensitive" } },
        { artistName: { contains: "Lady Gaga", mode: "insensitive" } },
      ],
    },
    include: {
      _count: {
        select: {
          queuePositions: true,
          purchases: true,
        },
      },
    },
  });

  if (ladyGagaEvents.length > 0) {
    console.log(`Found ${ladyGagaEvents.length} Lady Gaga test event(s):`);
    for (const event of ladyGagaEvents) {
      console.log(`  - ${event.eventName} (${event.tmEventId})`);
      console.log(`    Queue positions: ${event._count.queuePositions}, Purchases: ${event._count.purchases}`);
    }

    // Delete them (this will cascade delete queue positions and set null on purchases)
    for (const event of ladyGagaEvents) {
      try {
        await prisma.event.delete({
          where: { id: event.id },
        });
        console.log(`✓ Deleted: ${event.eventName}`);
      } catch (error) {
        console.error(`✗ Failed to delete ${event.eventName}:`, error);
      }
    }
  } else {
    console.log("No Lady Gaga test events found.");
  }

  console.log("\n---\n");

  // 3. Show final state of all events
  const allEvents = await prisma.event.findMany({
    orderBy: { eventDate: "asc" },
  });

  console.log(`Final event list (${allEvents.length} events):`);
  for (const event of allEvents) {
    const dayStr = event.dayOfWeek ? `${event.dayOfWeek}, ` : "";
    const dateStr = event.eventDate ? event.eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date";
    console.log(`  - ${event.artistName || event.eventName} @ ${event.venue || "Unknown"} | ${dayStr}${dateStr} | ID: ${event.tmEventId}`);
  }

  console.log("\nDone!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
