/**
 * Account POS Sync API
 *
 * GET /api/accounts/pos-sync - Get stats about POS import status
 * POST /api/accounts/pos-sync - Sync accounts from POS (update local records)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncAccountsFromPos,
  getAccountPosStats,
} from "@/lib/services/account-pos-sync";
import { formatSSE, getStreamHeaders } from "@/lib/utils/streaming";

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
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const streaming = searchParams.get("streaming") === "true";

    console.log("[Account POS Sync API] Starting sync from POS...");

    if (streaming) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          controller.enqueue(encoder.encode(formatSSE({
            type: "start",
            total: 0,
            label: "Syncing accounts from POS...",
          })));

          try {
            const result = await syncAccountsFromPos();

            if (result.success) {
              controller.enqueue(encoder.encode(formatSSE({
                type: "complete",
                current: result.synced,
                total: result.synced,
                success: result.synced,
                failed: result.notInPos,
                message: `Synced ${result.synced} accounts, ${result.notInPos} not in POS`,
              })));
            } else {
              controller.enqueue(encoder.encode(formatSSE({
                type: "error",
                message: result.error || "Sync failed",
              })));
            }
          } catch (error) {
            controller.enqueue(encoder.encode(formatSSE({
              type: "error",
              message: error instanceof Error ? error.message : "Sync failed",
            })));
          }

          controller.close();
        },
      });

      return new Response(stream, { headers: getStreamHeaders() });
    }

    // Non-streaming fallback
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
