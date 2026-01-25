/**
 * Script to link unlinked sales to purchases by matching
 * event + section + row + seats
 */

import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function linkSalesToPurchases() {
  console.log("=".repeat(60));
  console.log("LINKING SALES TO PURCHASES");
  console.log("=".repeat(60));
  console.log();

  // Get unlinked sales
  const unlinkedSales = await prisma.sale.findMany({
    where: { listingId: null },
  });

  console.log(`Found ${unlinkedSales.length} unlinked sales\n`);

  let linked = 0;
  let notFound = 0;

  for (const sale of unlinkedSales) {
    console.log(`\nProcessing: ${sale.eventName} - ${sale.section}/${sale.row} seats ${sale.seats}`);
    
    // Parse the seats to get individual seat numbers
    const seatMatch = sale.seats?.match(/^(\d+)-(\d+)$/);
    let startSeat: number | null = null;
    let endSeat: number | null = null;
    
    if (seatMatch) {
      startSeat = parseInt(seatMatch[1], 10);
      endSeat = parseInt(seatMatch[2], 10);
    } else if (sale.seats) {
      const single = parseInt(sale.seats, 10);
      if (!isNaN(single)) {
        startSeat = single;
        endSeat = single;
      }
    }

    if (!sale.section || !sale.row || startSeat === null) {
      console.log("  Skip: Missing section/row/seats info");
      notFound++;
      continue;
    }

    // Try to find a purchase that matches this section/row/seats
    // We look for purchases where the seat range includes our sold seats
    const purchases = await prisma.purchase.findMany({
      where: {
        section: sale.section,
        row: sale.row,
      },
      include: {
        event: true,
        account: true,
      },
    });

    console.log(`  Found ${purchases.length} purchases with matching section/row`);

    // Find purchase where seats overlap
    let matchingPurchase = null;
    for (const purchase of purchases) {
      // Parse purchase seats
      const purchaseSeatMatch = purchase.seats?.match(/^(\d+)-(\d+)$/);
      let purchaseStart: number | null = null;
      let purchaseEnd: number | null = null;
      
      if (purchaseSeatMatch) {
        purchaseStart = parseInt(purchaseSeatMatch[1], 10);
        purchaseEnd = parseInt(purchaseSeatMatch[2], 10);
      } else if (purchase.seats) {
        const single = parseInt(purchase.seats, 10);
        if (!isNaN(single)) {
          purchaseStart = single;
          purchaseEnd = single;
        }
      }

      if (purchaseStart !== null && purchaseEnd !== null && startSeat !== null && endSeat !== null) {
        // Check if our sold seats are within the purchase range
        if (startSeat >= purchaseStart && endSeat <= purchaseEnd) {
          matchingPurchase = purchase;
          console.log(`  MATCH: Purchase ${purchase.dashboardPoNumber} seats ${purchase.seats}`);
          break;
        }
      }
    }

    if (matchingPurchase) {
      // Update the sale with the PO number
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          extPONumber: matchingPurchase.dashboardPoNumber,
          // Note: We can't set listingId because there's no listing
          // But we can set the eventId from purchase
          eventId: matchingPurchase.eventId,
        },
      });
      console.log(`  Updated sale with PO: ${matchingPurchase.dashboardPoNumber}`);
      linked++;
    } else {
      console.log("  No matching purchase found");
      notFound++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: Linked ${linked}, Not found ${notFound}`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

linkSalesToPurchases().catch(console.error);
