/**
 * Cleanup script for duplicate events and purchases created by buggy email CSV import
 * 
 * Run with: npx ts-node scripts/cleanup-duplicate-imports.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting cleanup...\n");

  // 1. First, get stats on what we have
  const allEvents = await prisma.event.findMany({
    include: {
      _count: {
        select: {
          queuePositions: true,
          purchases: true,
        },
      },
    },
  });

  console.log(`Total events in database: ${allEvents.length}`);

  // Identify duplicate events (those with generated hash IDs)
  // Real TM event IDs follow patterns like: 0A006426C2444B31, 0B00642E155557B3
  // Generated hashes are 16-char hex but the pattern is different
  // Key indicators of fake events:
  // - No artistName
  // - 0 queue positions
  // - tmEventId doesn't match real TM patterns (real ones often start with 0x00, 0x01, 0x04, 0x0A, 0x0B, etc.)
  
  const duplicateEvents = allEvents.filter(event => {
    // Real events have artist names or queue positions
    const hasArtist = !!event.artistName;
    const hasQueueTests = event._count.queuePositions > 0;
    
    // If it has neither artist nor queue tests, it's likely a duplicate
    if (!hasArtist && !hasQueueTests) {
      return true;
    }
    
    return false;
  });

  const realEvents = allEvents.filter(event => {
    const hasArtist = !!event.artistName;
    const hasQueueTests = event._count.queuePositions > 0;
    return hasArtist || hasQueueTests;
  });

  console.log(`\nReal events (with artist or queue tests): ${realEvents.length}`);
  realEvents.forEach(e => {
    console.log(`  - ${e.eventName} @ ${e.venue} (${e.tmEventId}) - ${e._count.queuePositions} queue tests`);
  });

  console.log(`\nDuplicate events (no artist, no queue tests): ${duplicateEvents.length}`);
  duplicateEvents.forEach(e => {
    console.log(`  - ${e.eventName} @ ${e.venue} (${e.tmEventId})`);
  });

  // 2. Delete all purchases
  const purchaseCount = await prisma.purchase.count();
  console.log(`\nTotal purchases to delete: ${purchaseCount}`);

  if (purchaseCount > 0) {
    const deletedPurchases = await prisma.purchase.deleteMany({});
    console.log(`Deleted ${deletedPurchases.count} purchases`);
  }

  // 3. Delete duplicate events
  if (duplicateEvents.length > 0) {
    const duplicateIds = duplicateEvents.map(e => e.id);
    const deletedEvents = await prisma.event.deleteMany({
      where: { id: { in: duplicateIds } },
    });
    console.log(`Deleted ${deletedEvents.count} duplicate events`);
  }

  // 4. Verify final state
  const finalEventCount = await prisma.event.count();
  const finalPurchaseCount = await prisma.purchase.count();
  
  console.log(`\n=== Final State ===`);
  console.log(`Events: ${finalEventCount}`);
  console.log(`Purchases: ${finalPurchaseCount}`);
  
  console.log("\nCleanup complete!");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
