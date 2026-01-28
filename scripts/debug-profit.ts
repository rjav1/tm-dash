/**
 * Debug script to analyze profit calculation discrepancy
 * Run with: npx tsx scripts/debug-profit.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debugProfit() {
  console.log("=== PROFIT CALCULATION DEBUG ===\n");

  // 1. Count total sales
  const totalSales = await prisma.sale.count();
  console.log(`Total Sales: ${totalSales}`);

  // 2. Count sales with listings
  const salesWithListings = await prisma.sale.count({
    where: { listingId: { not: null } },
  });
  console.log(`Sales with Listings: ${salesWithListings}`);

  // 3. Count sales with listings that have purchases
  const salesWithPurchases = await prisma.sale.count({
    where: {
      listing: {
        purchaseId: { not: null },
      },
    },
  });
  console.log(`Sales with Linked Purchases: ${salesWithPurchases}`);
  console.log(`Sales WITHOUT Linked Purchases: ${totalSales - salesWithPurchases}`);

  // 4. Get revenue from invoices
  const invoiceAggregates = await prisma.invoice.aggregate({
    where: { isCancelled: false },
    _sum: {
      totalAmount: true,
      totalCost: true, // This is what TicketVault thinks our cost is
    },
  });
  
  const totalRevenue = Number(invoiceAggregates._sum.totalAmount || 0);
  const ticketVaultCost = Number(invoiceAggregates._sum.totalCost || 0);
  
  console.log(`\n=== REVENUE ===`);
  console.log(`Total Revenue (invoice.totalAmount): $${totalRevenue.toFixed(2)}`);

  // 5. Calculate cost from Purchase records (current approach)
  const allSales = await prisma.sale.findMany({
    select: {
      id: true,
      quantity: true,
      salePrice: true,
      listing: {
        select: {
          purchaseId: true,
          purchase: {
            select: {
              totalPrice: true,
              quantity: true,
            },
          },
        },
      },
    },
  });

  let derivedCost = 0;
  let salesWithCost = 0;
  let salesWithoutCost = 0;
  let totalSaleQuantity = 0;
  let quantityWithCost = 0;

  for (const sale of allSales) {
    totalSaleQuantity += sale.quantity;
    const purchase = sale.listing?.purchase;
    if (purchase && purchase.totalPrice && purchase.quantity && purchase.quantity > 0) {
      const costPerTicket = Number(purchase.totalPrice) / purchase.quantity;
      const saleCost = costPerTicket * sale.quantity;
      derivedCost += saleCost;
      salesWithCost++;
      quantityWithCost += sale.quantity;
    } else {
      salesWithoutCost++;
    }
  }

  console.log(`\n=== COST COMPARISON ===`);
  console.log(`TicketVault's Cost (invoice.totalCost): $${ticketVaultCost.toFixed(2)}`);
  console.log(`Our Derived Cost (from Purchases): $${derivedCost.toFixed(2)}`);
  console.log(`Difference: $${(ticketVaultCost - derivedCost).toFixed(2)}`);

  console.log(`\n=== PROFIT COMPARISON ===`);
  console.log(`Profit with TicketVault Cost: $${(totalRevenue - ticketVaultCost).toFixed(2)}`);
  console.log(`Profit with Derived Cost: $${(totalRevenue - derivedCost).toFixed(2)}`);

  console.log(`\n=== COVERAGE ===`);
  console.log(`Sales with cost data: ${salesWithCost} (${((salesWithCost / totalSales) * 100).toFixed(1)}%)`);
  console.log(`Sales WITHOUT cost data: ${salesWithoutCost} (${((salesWithoutCost / totalSales) * 100).toFixed(1)}%)`);
  console.log(`Total ticket quantity: ${totalSaleQuantity}`);
  console.log(`Quantity with cost: ${quantityWithCost} (${((quantityWithCost / totalSaleQuantity) * 100).toFixed(1)}%)`);

  // 6. Sample some sales without purchase links to understand why
  console.log(`\n=== SAMPLE SALES WITHOUT PURCHASE LINKS ===`);
  const samplesWithoutPurchase = await prisma.sale.findMany({
    where: {
      OR: [
        { listingId: null },
        { listing: { purchaseId: null } },
      ],
    },
    select: {
      id: true,
      eventName: true,
      quantity: true,
      salePrice: true,
      extPONumber: true,
      listingId: true,
      listing: {
        select: {
          id: true,
          extPONumber: true,
          purchaseId: true,
        },
      },
    },
    take: 10,
  });

  for (const sale of samplesWithoutPurchase) {
    console.log(`  Sale: ${sale.eventName?.substring(0, 30)} | qty: ${sale.quantity} | $${sale.salePrice}`);
    console.log(`    extPONumber: ${sale.extPONumber || "none"}`);
    console.log(`    listingId: ${sale.listingId || "none"}`);
    if (sale.listing) {
      console.log(`    listing.extPONumber: ${sale.listing.extPONumber || "none"}`);
      console.log(`    listing.purchaseId: ${sale.listing.purchaseId || "none"}`);
    }
    console.log("");
  }

  // 7. Check if unlinked sales can be linked via extPONumber to Purchase.dashboardPoNumber
  console.log(`\n=== CHECKING DIRECT PURCHASE LINKS ===`);
  
  const salesWithPONoListing = await prisma.sale.findMany({
    where: { 
      listingId: null,
      extPONumber: { not: null }
    },
    select: { id: true, extPONumber: true, quantity: true, salePrice: true },
  });
  
  console.log(`Sales without listing but with extPONumber: ${salesWithPONoListing.length}`);
  
  let directMatchCount = 0;
  let directMatchCost = 0;
  
  for (const sale of salesWithPONoListing) {
    const purchase = await prisma.purchase.findFirst({
      where: { dashboardPoNumber: sale.extPONumber },
      select: { totalPrice: true, quantity: true }
    });
    if (purchase && purchase.totalPrice && purchase.quantity) {
      directMatchCount++;
      const costPerTicket = Number(purchase.totalPrice) / purchase.quantity;
      directMatchCost += costPerTicket * sale.quantity;
    }
  }
  
  console.log(`Direct matches found: ${directMatchCount}`);
  console.log(`Additional cost from direct matches: $${directMatchCost.toFixed(2)}`);
  console.log(`\nTotal derived cost if we include direct matches: $${(derivedCost + directMatchCost).toFixed(2)}`);
  console.log(`Profit with combined cost: $${(totalRevenue - derivedCost - directMatchCost).toFixed(2)}`);

  await prisma.$disconnect();
}

debugProfit().catch(console.error);
