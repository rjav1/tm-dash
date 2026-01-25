/**
 * Migration Script: Backfill Tickets from Existing Purchases
 * 
 * This script creates individual Ticket records from existing Purchase records
 * that have seat information.
 * 
 * Run with: npx ts-node scripts/migrate-tickets.ts
 * Or: npx tsx scripts/migrate-tickets.ts
 */

import { PrismaClient, TicketStatus } from "@prisma/client";

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

interface MigrationStats {
  purchasesProcessed: number;
  ticketsCreated: number;
  ticketsSkipped: number;
  errors: number;
  errorDetails: string[];
}

// =============================================================================
// Seat Parsing (duplicate from ticket-service for standalone script)
// =============================================================================

function parseSeatRange(seatString: string): number[] {
  const seats: number[] = [];
  const original = seatString.trim();
  
  if (!original) return [];
  
  // Check if it's a simple range like "1-4"
  const simpleRangeMatch = original.match(/^(\d+)\s*-\s*(\d+)$/);
  if (simpleRangeMatch) {
    const start = parseInt(simpleRangeMatch[1], 10);
    const end = parseInt(simpleRangeMatch[2], 10);
    for (let i = start; i <= end; i++) {
      seats.push(i);
    }
    return seats;
  }
  
  // Check if it's a single number
  const singleMatch = original.match(/^(\d+)$/);
  if (singleMatch) {
    return [parseInt(singleMatch[1], 10)];
  }
  
  // Handle comma-separated list (may contain ranges)
  const parts = original.split(",").map((p) => p.trim());
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        seats.push(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) {
        seats.push(num);
      }
    }
  }
  
  // Sort and deduplicate
  return [...new Set(seats)].sort((a, b) => a - b);
}

// =============================================================================
// Migration Logic
// =============================================================================

async function migratePurchaseToTickets(
  purchase: {
    id: string;
    eventId: string | null;
    section: string | null;
    row: string | null;
    seats: string | null;
    priceEach: number | null;
    quantity: number;
    totalPrice: number | null;
  },
  stats: MigrationStats
): Promise<void> {
  // Skip if no event linked
  if (!purchase.eventId) {
    console.log(`  Skipping purchase ${purchase.id}: no eventId`);
    stats.ticketsSkipped += purchase.quantity;
    return;
  }
  
  // Skip if no section/row
  if (!purchase.section || !purchase.row) {
    console.log(`  Skipping purchase ${purchase.id}: no section/row`);
    stats.ticketsSkipped += purchase.quantity;
    return;
  }
  
  // Parse seats
  let seatNumbers: number[] = [];
  if (purchase.seats) {
    seatNumbers = parseSeatRange(purchase.seats);
  }
  
  // If no specific seats, generate based on quantity
  if (seatNumbers.length === 0 && purchase.quantity > 0) {
    // Use 1-based seat numbers
    for (let i = 1; i <= purchase.quantity; i++) {
      seatNumbers.push(i);
    }
    console.log(
      `  Purchase ${purchase.id}: No seats specified, generating ${seatNumbers.length} seats`
    );
  }
  
  // Calculate cost per ticket
  const costPerTicket =
    purchase.priceEach ||
    (purchase.totalPrice ? Number(purchase.totalPrice) / seatNumbers.length : 0);
  
  // Create tickets
  for (const seatNumber of seatNumbers) {
    try {
      await prisma.ticket.upsert({
        where: {
          eventId_section_row_seatNumber: {
            eventId: purchase.eventId,
            section: purchase.section,
            row: purchase.row,
            seatNumber,
          },
        },
        update: {
          // Don't overwrite if already exists
        },
        create: {
          purchaseId: purchase.id,
          eventId: purchase.eventId,
          section: purchase.section,
          row: purchase.row,
          seatNumber,
          cost: costPerTicket,
          status: TicketStatus.PURCHASED,
        },
      });
      stats.ticketsCreated++;
    } catch (error) {
      // May already exist - that's OK
      stats.ticketsSkipped++;
    }
  }
}

async function migrateAllPurchases(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    purchasesProcessed: 0,
    ticketsCreated: 0,
    ticketsSkipped: 0,
    errors: 0,
    errorDetails: [],
  };
  
  console.log("Starting ticket migration from purchases...\n");
  
  // Get all purchases with seat info
  const purchases = await prisma.purchase.findMany({
    where: {
      eventId: { not: null },
      section: { not: null },
      row: { not: null },
    },
    select: {
      id: true,
      eventId: true,
      section: true,
      row: true,
      seats: true,
      priceEach: true,
      quantity: true,
      totalPrice: true,
    },
  });
  
  console.log(`Found ${purchases.length} purchases to process\n`);
  
  for (const purchase of purchases) {
    try {
      console.log(`Processing purchase ${purchase.id}...`);
      await migratePurchaseToTickets(purchase, stats);
      stats.purchasesProcessed++;
    } catch (error) {
      console.error(`Error processing purchase ${purchase.id}:`, error);
      stats.errors++;
      stats.errorDetails.push(
        `${purchase.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  return stats;
}

// =============================================================================
// Listing Migration
// =============================================================================

async function migrateListingsToTickets(): Promise<{
  listingsProcessed: number;
  ticketsLinked: number;
}> {
  console.log("\nMigrating listings to link tickets...\n");
  
  let listingsProcessed = 0;
  let ticketsLinked = 0;
  
  // Get listings that have linked purchases
  const listings = await prisma.listing.findMany({
    where: {
      purchaseId: { not: null },
    },
    include: {
      purchase: {
        select: {
          eventId: true,
        },
      },
    },
  });
  
  console.log(`Found ${listings.length} listings to process\n`);
  
  for (const listing of listings) {
    const eventId = listing.purchase?.eventId;
    if (!eventId) continue;
    
    // Link tickets for this listing
    const result = await prisma.ticket.updateMany({
      where: {
        eventId,
        section: listing.section,
        row: listing.row,
        seatNumber: {
          gte: listing.startSeat,
          lte: listing.endSeat,
        },
        listingId: null,
      },
      data: {
        listingId: listing.id,
        status: TicketStatus.LISTED,
      },
    });
    
    listingsProcessed++;
    ticketsLinked += result.count;
    
    // Also update listing with eventId if not set
    if (!listing.eventId) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { eventId },
      });
    }
  }
  
  return { listingsProcessed, ticketsLinked };
}

// =============================================================================
// Sale Migration
// =============================================================================

async function migrateSalesToTickets(): Promise<{
  salesProcessed: number;
  ticketsLinked: number;
}> {
  console.log("\nMigrating sales to link tickets...\n");
  
  let salesProcessed = 0;
  let ticketsLinked = 0;
  
  // Get sales that have linked listings with purchases
  const sales = await prisma.sale.findMany({
    where: {
      listingId: { not: null },
    },
    include: {
      listing: {
        include: {
          purchase: {
            select: {
              eventId: true,
            },
          },
        },
      },
    },
  });
  
  console.log(`Found ${sales.length} sales to process\n`);
  
  for (const sale of sales) {
    const eventId = sale.listing?.purchase?.eventId;
    if (!eventId || !sale.section || !sale.row || !sale.seats) continue;
    
    const seatNumbers = parseSeatRange(sale.seats);
    
    for (const seatNumber of seatNumbers) {
      const result = await prisma.ticket.updateMany({
        where: {
          eventId,
          section: sale.section,
          row: sale.row,
          seatNumber,
          saleId: null,
        },
        data: {
          saleId: sale.id,
          status: TicketStatus.SOLD,
        },
      });
      
      ticketsLinked += result.count;
    }
    
    salesProcessed++;
    
    // Also update sale with eventId if not set
    if (!sale.eventId) {
      await prisma.sale.update({
        where: { id: sale.id },
        data: { eventId },
      });
    }
  }
  
  return { salesProcessed, ticketsLinked };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("=".repeat(60));
  console.log("TICKET MIGRATION SCRIPT");
  console.log("=".repeat(60));
  console.log();
  
  try {
    // Step 1: Create tickets from purchases
    const purchaseStats = await migrateAllPurchases();
    
    console.log("\n" + "-".repeat(40));
    console.log("Purchase Migration Results:");
    console.log(`  Purchases processed: ${purchaseStats.purchasesProcessed}`);
    console.log(`  Tickets created: ${purchaseStats.ticketsCreated}`);
    console.log(`  Tickets skipped: ${purchaseStats.ticketsSkipped}`);
    console.log(`  Errors: ${purchaseStats.errors}`);
    
    if (purchaseStats.errorDetails.length > 0) {
      console.log("\nError Details:");
      purchaseStats.errorDetails.forEach((e) => console.log(`  - ${e}`));
    }
    
    // Step 2: Link tickets to listings
    const listingStats = await migrateListingsToTickets();
    console.log("\n" + "-".repeat(40));
    console.log("Listing Migration Results:");
    console.log(`  Listings processed: ${listingStats.listingsProcessed}`);
    console.log(`  Tickets linked: ${listingStats.ticketsLinked}`);
    
    // Step 3: Link tickets to sales
    const saleStats = await migrateSalesToTickets();
    console.log("\n" + "-".repeat(40));
    console.log("Sale Migration Results:");
    console.log(`  Sales processed: ${saleStats.salesProcessed}`);
    console.log(`  Tickets linked: ${saleStats.ticketsLinked}`);
    
    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("MIGRATION COMPLETE");
    console.log("=".repeat(60));
    
    // Get final ticket count
    const ticketCount = await prisma.ticket.count();
    console.log(`\nTotal tickets in database: ${ticketCount}`);
    
    // Status breakdown
    const statusCounts = await prisma.ticket.groupBy({
      by: ["status"],
      _count: true,
    });
    console.log("\nTickets by status:");
    statusCounts.forEach((s) => {
      console.log(`  ${s.status}: ${s._count}`);
    });
  } catch (error) {
    console.error("\nMigration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
