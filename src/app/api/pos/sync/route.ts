/**
 * POS Sync API Routes
 *
 * POST /api/pos/sync - Sync selected purchases to TicketVault POS
 * GET /api/pos/sync - Get purchases ready for sync
 */

import { NextResponse } from "next/server";
import { syncPurchasesToPOS, getPurchasesReadyForSync, PurchaseSyncItem } from "@/lib/services/pos-sync";

/**
 * GET /api/pos/sync
 * Get purchases that are ready to sync (have events, not already synced)
 */
export async function GET() {
  try {
    const purchases = await getPurchasesReadyForSync();

    return NextResponse.json({
      success: true,
      count: purchases.length,
      purchases,
    });
  } catch (error) {
    console.error("[POS Sync API] Error fetching purchases:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch purchases",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/sync
 * Sync selected purchases to TicketVault POS
 *
 * Request body (two formats supported):
 * 
 * Simple format:
 * {
 *   purchaseIds: string[] - Array of purchase IDs to sync (uses defaults)
 * }
 * 
 * Detailed format:
 * {
 *   purchases: PurchaseSyncItem[] - Array with per-purchase options:
 *     {
 *       purchaseId: string,
 *       splitType?: number,     // 0=None, 2=Pairs, 3=AvoidSingles, 4=Any
 *       listingPrice?: number   // Default: 9999
 *     }
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { purchaseIds, purchases } = body;

    // Support both simple purchaseIds array and detailed purchases array
    let syncItems: string[] | PurchaseSyncItem[];
    
    if (purchases && Array.isArray(purchases) && purchases.length > 0) {
      // Detailed format with per-purchase options
      syncItems = purchases as PurchaseSyncItem[];
      console.log(`[POS Sync API] Syncing ${syncItems.length} purchases with custom options`);
    } else if (purchaseIds && Array.isArray(purchaseIds) && purchaseIds.length > 0) {
      // Simple format - just IDs
      syncItems = purchaseIds as string[];
      console.log(`[POS Sync API] Syncing ${syncItems.length} purchases with defaults`);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Either purchaseIds or purchases array is required",
        },
        { status: 400 }
      );
    }

    const result = await syncPurchasesToPOS(syncItems);

    console.log(
      `[POS Sync API] Sync complete: ${result.successful} successful, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[POS Sync API] Error syncing purchases:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync purchases",
      },
      { status: 500 }
    );
  }
}

