/**
 * PO Numbers API Routes
 *
 * POST /api/pos/po-numbers - Assign PO numbers to all purchases
 * GET /api/pos/po-numbers - Get PO sync summary
 */

import { NextResponse } from "next/server";
import {
  assignPoNumbersToAllPurchases,
  getPosSyncSummary,
} from "@/lib/services/pos-sync";

/**
 * GET /api/pos/po-numbers
 * Get summary of PO number assignments and sync status
 */
export async function GET() {
  try {
    const summary = await getPosSyncSummary();

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("[PO Numbers API] Error fetching summary:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch summary",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/po-numbers
 * Assign PO numbers to ALL successful purchases that don't have one
 */
export async function POST() {
  try {
    console.log("[PO Numbers API] Assigning PO numbers to all purchases");

    const result = await assignPoNumbersToAllPurchases();

    console.log(
      `[PO Numbers API] Assigned ${result.assigned} new PO numbers, ${result.alreadyHad} already had numbers`
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[PO Numbers API] Error assigning PO numbers:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to assign PO numbers",
      },
      { status: 500 }
    );
  }
}
