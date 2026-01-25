/**
 * POS Import API Routes
 *
 * GET /api/pos/import - Get POS orders available for import
 * POST /api/pos/import - Link a POS order to a dashboard purchase
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getPosOrdersForImport,
  matchPosOrderToPurchase,
  linkPosOrderToPurchase,
} from "@/lib/services/pos-sync";

/**
 * GET /api/pos/import
 * Get list of POS orders that can be imported to dashboard
 */
export async function GET() {
  try {
    const orders = await getPosOrdersForImport();

    // For each order's ticket groups, try to find matching dashboard purchases
    const ordersWithMatches = await Promise.all(
      orders.map(async (order) => {
        // For each ticket group, try to match
        const ticketGroupsWithMatches = await Promise.all(
          order.ticketGroups.map(async (tg) => {
            const match = await matchPosOrderToPurchase(
              order.posOrderId,
              tg.costPerTicket * tg.quantity,
              {
                section: tg.section,
                row: tg.row,
                quantity: tg.quantity,
                accountEmail: tg.accountEmail,
              }
            );
            return {
              ...tg,
              matchedPurchaseId: match.purchaseId,
              matchConfidence: match.confidence,
              matchReason: match.reason,
            };
          })
        );

        // Use the best match from all ticket groups
        type MatchResult = typeof ticketGroupsWithMatches[number];
        const bestMatch = ticketGroupsWithMatches.reduce<MatchResult | { matchConfidence: "none"; matchedPurchaseId: null; matchReason: string }>(
          (best, current) => {
            const confidenceOrder = ["exact", "high", "medium", "low", "none"];
            const currentIdx = confidenceOrder.indexOf(current.matchConfidence);
            const bestIdx = confidenceOrder.indexOf(best.matchConfidence);
            return currentIdx < bestIdx ? current : best;
          },
          { matchConfidence: "none", matchedPurchaseId: null, matchReason: "" }
        );

        return {
          ...order,
          ticketGroups: ticketGroupsWithMatches,
          matchedPurchaseId: bestMatch.matchedPurchaseId,
          matchConfidence: bestMatch.matchConfidence,
          matchReason: bestMatch.matchReason,
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: ordersWithMatches.length,
      orders: ordersWithMatches,
    });
  } catch (error) {
    console.error("[POS Import API] Error fetching orders:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch orders",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/import
 * Link a POS order to a dashboard purchase
 *
 * Request body:
 * {
 *   purchaseId: string - Dashboard purchase ID to link
 *   posOrderId: number - POS order ID to link
 *   posTicketGroupId?: number - Optional ticket group ID
 *   posEventId?: number - Optional event ID
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchaseId, posOrderId, posTicketGroupId, posEventId } = body;

    if (!purchaseId || !posOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: "purchaseId and posOrderId are required",
        },
        { status: 400 }
      );
    }

    console.log(`[POS Import API] Linking POS order ${posOrderId} to purchase ${purchaseId}`);

    const result = await linkPosOrderToPurchase(
      purchaseId,
      posOrderId,
      posTicketGroupId,
      posEventId
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Linked POS order ${posOrderId} to purchase ${purchaseId}`,
    });
  } catch (error) {
    console.error("[POS Import API] Error linking order:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to link order",
      },
      { status: 500 }
    );
  }
}
