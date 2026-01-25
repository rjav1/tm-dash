/**
 * POS Orders API Routes
 *
 * GET /api/pos/orders - Fetch purchase orders from TicketVault POS
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchPosOrders } from "@/lib/services/pos-sync";

/**
 * GET /api/pos/orders
 * Fetch purchase orders from TicketVault POS
 * 
 * Query params:
 * - extPONumber: Filter by external PO number (dashboard PO)
 * - accountEmail: Filter by account email
 * - skip: Pagination offset (default 0)
 * - take: Pagination limit (default 500)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const extPONumber = searchParams.get("extPONumber") || undefined;
    const accountEmail = searchParams.get("accountEmail") || undefined;
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const take = parseInt(searchParams.get("take") || "500", 10);

    console.log("[POS Orders API] Fetching orders", {
      extPONumber,
      accountEmail,
      skip,
      take,
    });

    const orders = await fetchPosOrders({
      extPONumber,
      accountEmail,
      skip,
      take,
    });

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("[POS Orders API] Error fetching orders:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch orders",
      },
      { status: 500 }
    );
  }
}
