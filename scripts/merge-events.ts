/**
 * Script to merge duplicate events
 * 
 * Run with: npx tsx scripts/merge-events.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Merging Duplicate Events ===\n");

  // Define merges: source event (to delete) -> target event (to keep)
  const merges = [
    {
      // Bruno Mars @ Rogers Stadium - move purchases from "The Romantic Tour" to the correct one
      sourceEventId: "cmklk360y0000znyk2vo1z0g8", // 5C9AB2FBAFC03B64 (5 purchases, 0 queues)
      targetEventId: "cmkljn20j0000znd8isk9suar", // 10006430621E2612 (0 purchases, 1119 queues)
      description: "Bruno Mars @ Rogers Stadium",
    },
    {
      // Bruno Mars @ SoFi Stadium - move purchases from Oct 8 to Oct 7
      sourceEventId: "cmkh4d1yq01mezng4zmg0orw0", // 1BF3097835AA7EF0 (77 purchases, 0 queues)
      targetEventId: "cmkh4fmgq01t8zng4ulg7bgly", // 0A006426C2444B31 (0 purchases, 463 queues)
      description: "Bruno Mars @ SoFi Stadium",
    },
  ];

  for (const merge of merges) {
    console.log(`\n--- ${merge.description} ---`);
    
    // Get source event info
    const sourceEvent = await prisma.event.findUnique({
      where: { id: merge.sourceEventId },
      include: {
        _count: { select: { purchases: true, queuePositions: true } },
      },
    });

    const targetEvent = await prisma.event.findUnique({
      where: { id: merge.targetEventId },
      include: {
        _count: { select: { purchases: true, queuePositions: true } },
      },
    });

    if (!sourceEvent || !targetEvent) {
      console.log("  Source or target event not found, skipping...");
      continue;
    }

    console.log(`  Source: ${sourceEvent.eventName} (${sourceEvent.tmEventId})`);
    console.log(`    Purchases: ${sourceEvent._count.purchases}, Queues: ${sourceEvent._count.queuePositions}`);
    console.log(`  Target: ${targetEvent.eventName} (${targetEvent.tmEventId})`);
    console.log(`    Purchases: ${targetEvent._count.purchases}, Queues: ${targetEvent._count.queuePositions}`);

    // Move purchases from source to target
    if (sourceEvent._count.purchases > 0) {
      const result = await prisma.purchase.updateMany({
        where: { eventId: merge.sourceEventId },
        data: { eventId: merge.targetEventId },
      });
      console.log(`  ✓ Moved ${result.count} purchases to target event`);
    }

    // Move queue positions from source to target (if any)
    if (sourceEvent._count.queuePositions > 0) {
      // Need to handle potential duplicates (same account, same event)
      const sourceQueues = await prisma.queuePosition.findMany({
        where: { eventId: merge.sourceEventId },
      });

      let moved = 0;
      let skipped = 0;

      for (const queue of sourceQueues) {
        // Check if this account already has a position for the target event
        const existing = await prisma.queuePosition.findUnique({
          where: {
            accountId_eventId: {
              accountId: queue.accountId,
              eventId: merge.targetEventId,
            },
          },
        });

        if (existing) {
          // Delete the source one (duplicate)
          await prisma.queuePosition.delete({ where: { id: queue.id } });
          skipped++;
        } else {
          // Move to target
          await prisma.queuePosition.update({
            where: { id: queue.id },
            data: { eventId: merge.targetEventId },
          });
          moved++;
        }
      }

      console.log(`  ✓ Moved ${moved} queue positions, skipped ${skipped} duplicates`);
    }

    // Delete the source event
    await prisma.event.delete({ where: { id: merge.sourceEventId } });
    console.log(`  ✓ Deleted source event: ${sourceEvent.tmEventId}`);
  }

  // Now fix event names
  console.log("\n\n=== Fixing Event Names ===\n");

  const nameUpdates = [
    {
      tmEventId: "0A006426C2444B31",
      eventName: "Bruno Mars",
      artistName: "Bruno Mars",
    },
    {
      tmEventId: "10006430621E2612", 
      eventName: "Bruno Mars",
      artistName: "Bruno Mars",
    },
    {
      tmEventId: "1900642D2342860F",
      eventName: "Madison Beer",
      artistName: "Madison Beer",
    },
  ];

  for (const update of nameUpdates) {
    const result = await prisma.event.update({
      where: { tmEventId: update.tmEventId },
      data: { 
        eventName: update.eventName,
        artistName: update.artistName,
      },
    });
    console.log(`✓ Updated ${update.tmEventId}: "${result.eventName}" by ${result.artistName}`);
  }

  // Show final state
  console.log("\n\n=== Final Event List ===\n");

  const allEvents = await prisma.event.findMany({
    include: {
      _count: { select: { purchases: true, queuePositions: true } },
    },
    orderBy: { eventDate: "asc" },
  });

  console.log(`Total events: ${allEvents.length}\n`);
  for (const event of allEvents) {
    console.log(`${event.artistName} @ ${event.venue}`);
    console.log(`  ID: ${event.tmEventId}`);
    console.log(`  Date: ${event.dayOfWeek}, ${event.eventDate?.toLocaleDateString()}`);
    console.log(`  Queue positions: ${event._count.queuePositions}`);
    console.log(`  Purchases: ${event._count.purchases}`);
    console.log();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
