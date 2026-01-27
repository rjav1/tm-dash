/**
 * Auto-Tagging API Route
 * 
 * POST /api/tags/auto-tag - Run auto-tagging for accounts and cards
 * 
 * This applies:
 * - "Tested" tag to accounts with queue positions
 * - "Purchased" tag to accounts with purchases
 * - Purchase count tags (1, 2, 3+) to accounts and cards
 */

import { NextResponse } from "next/server";
import { runAutoTagging } from "@/lib/services/auto-tagging";

export async function POST() {
  try {
    const result = await runAutoTagging();
    
    return NextResponse.json({
      success: true,
      message: "Auto-tagging completed",
      ...result,
    });
  } catch (error) {
    console.error("[Auto-Tag API] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Auto-tagging failed" },
      { status: 500 }
    );
  }
}
