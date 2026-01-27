/**
 * Data Migration API: Fix priceEach values
 * 
 * This endpoint updates all Purchase records to ensure priceEach = totalPrice / quantity.
 * This fixes historical data where priceEach may have stored pre-fees values.
 * 
 * POST /api/purchases/fix-price-each
 * 
 * This is a one-time migration endpoint. Run it once after deploying the priceEach fix.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST() {
  try {
    console.log("[FixPriceEach] Starting data migration...");

    // Find all purchases where we can calculate the correct priceEach
    const purchasesToFix = await prisma.purchase.findMany({
      where: {
        totalPrice: { not: null },
        quantity: { gt: 0 },
      },
      select: {
        id: true,
        totalPrice: true,
        quantity: true,
        priceEach: true,
      },
    });

    console.log(`[FixPriceEach] Found ${purchasesToFix.length} purchases to check`);

    let updated = 0;
    let skipped = 0;
    let alreadyCorrect = 0;

    for (const purchase of purchasesToFix) {
      const correctPriceEach = Number(purchase.totalPrice) / purchase.quantity;
      const currentPriceEach = purchase.priceEach ? Number(purchase.priceEach) : null;

      // Check if already correct (within a small tolerance for floating point)
      if (currentPriceEach !== null && Math.abs(currentPriceEach - correctPriceEach) < 0.01) {
        alreadyCorrect++;
        continue;
      }

      try {
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { priceEach: correctPriceEach },
        });
        updated++;
      } catch (error) {
        console.error(`[FixPriceEach] Error updating purchase ${purchase.id}:`, error);
        skipped++;
      }
    }

    console.log(`[FixPriceEach] Migration complete: ${updated} updated, ${alreadyCorrect} already correct, ${skipped} skipped`);

    return NextResponse.json({
      success: true,
      message: `Fixed priceEach values: ${updated} updated, ${alreadyCorrect} already correct, ${skipped} skipped`,
      total: purchasesToFix.length,
      updated,
      alreadyCorrect,
      skipped,
    });
  } catch (error) {
    console.error("[FixPriceEach] Migration error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Migration failed" 
      },
      { status: 500 }
    );
  }
}

// GET endpoint to preview what would be fixed (dry run)
export async function GET() {
  try {
    // Find purchases where priceEach doesn't match totalPrice/quantity
    const purchasesToCheck = await prisma.purchase.findMany({
      where: {
        totalPrice: { not: null },
        quantity: { gt: 0 },
      },
      select: {
        id: true,
        totalPrice: true,
        quantity: true,
        priceEach: true,
        dashboardPoNumber: true,
      },
      take: 100, // Limit for preview
    });

    const needsFix = purchasesToCheck.filter((p) => {
      const correctPriceEach = Number(p.totalPrice) / p.quantity;
      const currentPriceEach = p.priceEach ? Number(p.priceEach) : null;
      return currentPriceEach === null || Math.abs(currentPriceEach - correctPriceEach) >= 0.01;
    });

    return NextResponse.json({
      success: true,
      message: `Found ${needsFix.length} purchases that need fixing (showing first 100)`,
      total: needsFix.length,
      samples: needsFix.slice(0, 10).map((p) => ({
        id: p.id,
        poNumber: p.dashboardPoNumber,
        currentPriceEach: p.priceEach ? Number(p.priceEach) : null,
        correctPriceEach: Number(p.totalPrice) / p.quantity,
        totalPrice: Number(p.totalPrice),
        quantity: p.quantity,
      })),
    });
  } catch (error) {
    console.error("[FixPriceEach] Preview error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Preview failed" 
      },
      { status: 500 }
    );
  }
}
