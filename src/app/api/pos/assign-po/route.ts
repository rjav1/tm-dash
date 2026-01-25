/**
 * POS Assign PO Numbers API
 * 
 * POST /api/pos/assign-po - Assign PO numbers to all successful purchases without one
 * GET /api/pos/assign-po - Get count of purchases missing PO numbers
 */

import { NextResponse } from "next/server";
import { assignPoNumbersToAllPurchases } from "@/lib/services/pos-sync";
import prisma from "@/lib/db";

/**
 * GET /api/pos/assign-po
 * Get count of purchases missing PO numbers
 */
export async function GET() {
  try {
    const count = await prisma.purchase.count({
      where: {
        status: "SUCCESS",
        dashboardPoNumber: null,
      },
    });

    return NextResponse.json({
      success: true,
      missingPoNumbers: count,
    });
  } catch (error) {
    console.error("[Assign PO API] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/assign-po
 * Assign PO numbers to all successful purchases that don't have one
 */
export async function POST() {
  try {
    console.log("[Assign PO API] Assigning PO numbers to all purchases...");
    
    const result = await assignPoNumbersToAllPurchases();
    
    console.log(`[Assign PO API] Assigned ${result.assigned} PO numbers`);
    
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[Assign PO API] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
