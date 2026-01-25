/**
 * POS Verify API Routes
 *
 * GET /api/pos/verify?purchaseId=xxx - Verify a synced purchase exists in POS with correct data
 * GET /api/pos/verify?poNumber=xxx - Verify by dashboard PO number
 */

import { NextRequest, NextResponse } from "next/server";
import { TicketVaultApi } from "@/lib/services/ticketvault-api";
import prisma from "@/lib/db";

/**
 * GET /api/pos/verify
 * Verify synced purchase data in POS
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const purchaseId = searchParams.get("purchaseId");
    const poNumber = searchParams.get("poNumber");

    if (!purchaseId && !poNumber) {
      return NextResponse.json(
        { success: false, error: "Either purchaseId or poNumber is required" },
        { status: 400 }
      );
    }

    let dashboardPoNumber: string | null = poNumber;
    let posPurchaseOrderId: number | null = null;

    // If purchaseId provided, look up from database
    if (purchaseId) {
      const purchase = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        select: {
          dashboardPoNumber: true,
          posPurchaseOrderId: true,
          posTicketGroupId: true,
          posSyncedAt: true,
          section: true,
          row: true,
          seats: true,
          quantity: true,
          totalPrice: true,
          account: {
            select: { email: true },
          },
        },
      });

      if (!purchase) {
        return NextResponse.json(
          { success: false, error: "Purchase not found" },
          { status: 404 }
        );
      }

      dashboardPoNumber = purchase.dashboardPoNumber;
      posPurchaseOrderId = purchase.posPurchaseOrderId;

      // If we have the POS Purchase Order ID, get ticket groups directly
      if (posPurchaseOrderId) {
        const ticketGroups = await TicketVaultApi.getTicketGroupsForPO(
          posPurchaseOrderId
        );

        // Find the matching ticket group by ExtPONumber
        const matchingTicketGroup = ticketGroups.find(
          (tg) => tg.ExtPONumber === dashboardPoNumber
        );

        return NextResponse.json({
          success: true,
          verified: !!matchingTicketGroup,
          dashboard: {
            purchaseId,
            poNumber: dashboardPoNumber,
            section: purchase.section,
            row: purchase.row,
            seats: purchase.seats,
            quantity: purchase.quantity,
            totalPrice: purchase.totalPrice ? Number(purchase.totalPrice) : null,
            accountEmail: purchase.account?.email,
            syncedAt: purchase.posSyncedAt,
          },
          pos: matchingTicketGroup
            ? {
                purchaseOrderId: posPurchaseOrderId,
                ticketGroupId: matchingTicketGroup.Id,
                section: matchingTicketGroup.Section,
                row: matchingTicketGroup.Row,
                startSeat: matchingTicketGroup.StartSeat,
                endSeat: matchingTicketGroup.EndSeat,
                quantity: matchingTicketGroup.Quantity,
                costPerTicket: matchingTicketGroup.CostPerTicket,
                totalCost: matchingTicketGroup.TotalCost,
                extPONumber: matchingTicketGroup.ExtPONumber,
                accountEmail: matchingTicketGroup.AccountEmail,
                eventName: matchingTicketGroup.EventName,
                venueName: matchingTicketGroup.VenueName,
                eventDateTime: matchingTicketGroup.EventDateTime,
                price: matchingTicketGroup.Price,
                isSold: matchingTicketGroup.IsCompletelySold,
              }
            : null,
          allTicketGroups: ticketGroups.length,
        });
      }
    }

    // If no posPurchaseOrderId, search by ExtPONumber
    if (dashboardPoNumber) {
      const result = await TicketVaultApi.findTicketGroupByExtPONumber(
        dashboardPoNumber
      );

      if (result) {
        return NextResponse.json({
          success: true,
          verified: true,
          foundBySearch: true,
          pos: {
            purchaseOrderId: result.purchaseOrder.Id,
            ticketGroupId: result.ticketGroup.Id,
            section: result.ticketGroup.Section,
            row: result.ticketGroup.Row,
            startSeat: result.ticketGroup.StartSeat,
            endSeat: result.ticketGroup.EndSeat,
            quantity: result.ticketGroup.Quantity,
            costPerTicket: result.ticketGroup.CostPerTicket,
            totalCost: result.ticketGroup.TotalCost,
            extPONumber: result.ticketGroup.ExtPONumber,
            accountEmail: result.ticketGroup.AccountEmail,
            eventName: result.ticketGroup.EventName,
            venueName: result.ticketGroup.VenueName,
            eventDateTime: result.ticketGroup.EventDateTime,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      verified: false,
      error: "Could not find matching ticket group in POS",
    });
  } catch (error) {
    console.error("[POS Verify API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Verification failed",
      },
      { status: 500 }
    );
  }
}
