/**
 * Account POS Sync API
 *
 * GET /api/accounts/pos-sync - Get stats about POS import status
 * POST /api/accounts/pos-sync - Sync accounts from POS (update local records)
 */

import { NextResponse } from "next/server";
import {
  AccountPosSync,
  syncAccountsFromPos,
  getAccountPosStats,
} from "@/lib/services/account-pos-sync";

/**
 * GET /api/accounts/pos-sync
 * Get stats about POS import status
 */
export async function GET() {
  try {
    const stats = await getAccountPosStats();

    return NextResponse.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    console.error("[Account POS Sync API] GET error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounts/pos-sync
 * Sync accounts from POS to update local import status
 */
export async function POST() {
  try {
    console.log("[Account POS Sync API] Starting sync from POS...");

    const result = await syncAccountsFromPos();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      synced: result.synced,
      notInPos: result.notInPos,
    });
  } catch (error) {
    console.error("[Account POS Sync API] POST error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
