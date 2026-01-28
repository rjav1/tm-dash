/**
 * Backfill script to create QueueBatch records for existing queue positions.
 * 
 * This script:
 * 1. Finds all events that have queue positions
 * 2. Creates a "Default" batch for each event
 * 3. Links all existing queue positions to their event's batch
 * 
 * Run with: npx tsx scripts/backfill-queue-batches.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting queue batch backfill...\n");

  // Get all events that have queue positions
  const eventsWithPositions = await prisma.event.findMany({
    where: {
      queuePositions: {
        some: {},
      },
    },
    select: {
      id: true,
      eventName: true,
      tmEventId: true,
      _count: {
        select: { queuePositions: true },
      },
    },
  });

  console.log(`Found ${eventsWithPositions.length} events with queue positions\n`);

  let batchesCreated = 0;
  let positionsUpdated = 0;

  for (const event of eventsWithPositions) {
    console.log(`Processing: ${event.eventName} (${event._count.queuePositions} positions)`);

    // Check if a default batch already exists
    let batch = await prisma.queueBatch.findUnique({
      where: {
        eventId_tag: {
          eventId: event.id,
          tag: "Default",
        },
      },
    });

    if (!batch) {
      // Create the default batch
      batch = await prisma.queueBatch.create({
        data: {
          eventId: event.id,
          tag: "Default",
          notes: "Auto-created during migration",
        },
      });
      batchesCreated++;
      console.log(`  Created "Default" batch: ${batch.id}`);
    } else {
      console.log(`  "Default" batch already exists: ${batch.id}`);
    }

    // Update all queue positions for this event to use this batch
    const result = await prisma.queuePosition.updateMany({
      where: {
        eventId: event.id,
        batchId: null,
      },
      data: {
        batchId: batch.id,
      },
    });

    positionsUpdated += result.count;
    console.log(`  Updated ${result.count} positions\n`);
  }

  console.log("=".repeat(50));
  console.log(`Backfill complete!`);
  console.log(`  Batches created: ${batchesCreated}`);
  console.log(`  Positions updated: ${positionsUpdated}`);

  // Verify no orphaned positions remain
  const orphanedCount = await prisma.queuePosition.count({
    where: { batchId: null },
  });

  if (orphanedCount > 0) {
    console.log(`\n⚠️  Warning: ${orphanedCount} queue positions still have no batch!`);
  } else {
    console.log(`\n✓ All queue positions have been assigned to batches.`);
  }
}

main()
  .catch((e) => {
    console.error("Error during backfill:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
