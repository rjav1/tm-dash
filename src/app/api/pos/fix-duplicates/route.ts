import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/pos/fix-duplicates
 * Check for duplicate PO numbers and database constraint status
 */
export async function GET() {
  try {
    // Check if unique constraint exists on the database
    let constraintExists = false;
    try {
      const constraintCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM pg_indexes 
        WHERE tablename = 'purchases' 
        AND indexdef LIKE '%dashboard_po_number%' 
        AND indexdef LIKE '%UNIQUE%'
      `;
      constraintExists = constraintCheck[0]?.count > 0;
    } catch {
      // If query fails, assume we can't check
    }

    // Find all purchases with dashboardPoNumber
    const purchasesWithPo = await prisma.purchase.findMany({
      where: {
        dashboardPoNumber: { not: null },
      },
      select: {
        id: true,
        dashboardPoNumber: true,
        section: true,
        row: true,
        seats: true,
        quantity: true,
        createdAt: true,
        account: { select: { email: true } },
        event: { select: { eventName: true } },
      },
      orderBy: { dashboardPoNumber: "asc" },
    });

    // Group by PO number
    const poGroups = new Map<string, typeof purchasesWithPo>();
    for (const p of purchasesWithPo) {
      if (!p.dashboardPoNumber) continue;
      const existing = poGroups.get(p.dashboardPoNumber) || [];
      existing.push(p);
      poGroups.set(p.dashboardPoNumber, existing);
    }

    // Find duplicates
    const duplicates: Array<{
      poNumber: string;
      count: number;
      purchases: typeof purchasesWithPo;
    }> = [];

    for (const [poNumber, purchases] of poGroups.entries()) {
      if (purchases.length > 1) {
        duplicates.push({
          poNumber,
          count: purchases.length,
          purchases,
        });
      }
    }

    return NextResponse.json({
      success: true,
      constraintExists,
      totalWithPo: purchasesWithPo.length,
      duplicateCount: duplicates.length,
      duplicates: duplicates.map((d) => ({
        poNumber: d.poNumber,
        count: d.count,
        purchases: d.purchases.map((p) => ({
          id: p.id,
          email: p.account?.email,
          event: p.event?.eventName,
          section: p.section,
          row: p.row,
          seats: p.seats,
          quantity: p.quantity,
          createdAt: p.createdAt,
        })),
      })),
    });
  } catch (error) {
    console.error("Check duplicates error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/fix-duplicates
 * Fix duplicate PO numbers by reassigning new unique numbers to duplicates
 * Also ensures the database unique constraint is in place
 */
export async function POST() {
  try {
    // Find all purchases with dashboardPoNumber
    const purchasesWithPo = await prisma.purchase.findMany({
      where: {
        dashboardPoNumber: { not: null },
      },
      select: {
        id: true,
        dashboardPoNumber: true,
        createdAt: true,
      },
      orderBy: [{ dashboardPoNumber: "asc" }, { createdAt: "asc" }],
    });

    // Group by PO number
    const poGroups = new Map<string, typeof purchasesWithPo>();
    for (const p of purchasesWithPo) {
      if (!p.dashboardPoNumber) continue;
      const existing = poGroups.get(p.dashboardPoNumber) || [];
      existing.push(p);
      poGroups.set(p.dashboardPoNumber, existing);
    }

    // Find duplicates and fix them
    let fixed = 0;
    const fixedPurchases: Array<{ id: string; oldPo: string; newPo: string }> =
      [];

    // Get current max PO number from setting OR find max in database
    const maxPoSetting = await prisma.setting.findUnique({
      where: { key: "next_dashboard_po_number" },
    });
    
    // Also check actual max PO in database to ensure we don't reuse numbers
    const maxPoInDb = await prisma.purchase.findFirst({
      where: { dashboardPoNumber: { not: null } },
      orderBy: { dashboardPoNumber: "desc" },
      select: { dashboardPoNumber: true },
    });
    
    const settingValue = maxPoSetting ? parseInt(maxPoSetting.value, 10) : 1;
    const dbMaxValue = maxPoInDb?.dashboardPoNumber 
      ? parseInt(maxPoInDb.dashboardPoNumber, 10) + 1 
      : 1;
    
    // Use the higher of the two to ensure uniqueness
    let nextPoNumber = Math.max(settingValue, dbMaxValue);

    for (const [poNumber, purchases] of poGroups.entries()) {
      if (purchases.length > 1) {
        // Keep the first one (oldest), reassign the rest
        // Sort by createdAt to keep the oldest
        purchases.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );

        for (let i = 1; i < purchases.length; i++) {
          const purchase = purchases[i];
          const newPoNumber = nextPoNumber.toString().padStart(6, "0");
          nextPoNumber++;

          await prisma.purchase.update({
            where: { id: purchase.id },
            data: { dashboardPoNumber: newPoNumber },
          });

          fixedPurchases.push({
            id: purchase.id,
            oldPo: poNumber,
            newPo: newPoNumber,
          });
          fixed++;
        }
      }
    }

    // Update the next PO number setting
    await prisma.setting.upsert({
      where: { key: "next_dashboard_po_number" },
      create: { key: "next_dashboard_po_number", value: nextPoNumber.toString() },
      update: { value: nextPoNumber.toString() },
    });

    // Try to create/verify the unique constraint
    let constraintApplied = false;
    try {
      // Check if constraint exists
      const existing = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'purchases' 
        AND indexdef LIKE '%dashboard_po_number%UNIQUE%'
      `;
      
      if (existing.length === 0) {
        // Try to add the unique index
        await prisma.$executeRaw`
          CREATE UNIQUE INDEX IF NOT EXISTS "purchases_dashboard_po_number_key" 
          ON "purchases" ("dashboard_po_number") 
          WHERE "dashboard_po_number" IS NOT NULL
        `;
        constraintApplied = true;
      } else {
        constraintApplied = true; // Already exists
      }
    } catch (constraintError) {
      console.error("Could not apply unique constraint:", constraintError);
    }

    return NextResponse.json({
      success: true,
      fixed,
      nextPoNumber,
      constraintApplied,
      fixedPurchases,
    });
  } catch (error) {
    console.error("Fix duplicates error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
