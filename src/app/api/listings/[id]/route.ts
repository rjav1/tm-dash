import { NextRequest, NextResponse } from "next/server";
import { ListingService } from "@/lib/services/listing-service";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/listings/[id]
 * Get a single listing by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const listing = await prisma.listing.findUnique({
      where: { id },
    });

    if (!listing) {
      return NextResponse.json(
        { success: false, error: "Listing not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        ticketGroupId: listing.ticketGroupId,
        eventName: listing.eventName,
        venueName: listing.venueName,
        venueCity: listing.venueCity,
        eventDateTime: listing.eventDateTime,
        section: listing.section,
        row: listing.row,
        startSeat: listing.startSeat,
        endSeat: listing.endSeat,
        quantity: listing.quantity,
        cost: Number(listing.cost),
        price: Number(listing.price),
        accountEmail: listing.accountEmail,
        internalNote: listing.internalNote,
        extPONumber: listing.extPONumber,
        isMatched: listing.isMatched,
        barcodesCount: listing.barcodesCount,
        pdfsCount: listing.pdfsCount,
        linksCount: listing.linksCount,
        pdfStatus: listing.pdfStatus,
        vividEventId: listing.vividEventId,
        stubhubEventId: listing.stubhubEventId,
        seatgeekEventId: listing.seatgeekEventId,
        tmEventId: listing.tmEventId,
        lastSyncedAt: listing.lastSyncedAt,
        purchaseId: listing.purchaseId,
      },
    });
  } catch (error) {
    console.error("Get listing error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/listings/[id]
 * Update listing (currently supports price update)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { price } = body;

    if (price === undefined || price === null) {
      return NextResponse.json(
        { success: false, error: "price is required" },
        { status: 400 }
      );
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Invalid price value" },
        { status: 400 }
      );
    }

    const result = await ListingService.updateListingPrice(id, numPrice);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Price updated to $${numPrice} in TicketVault`,
    });
  } catch (error) {
    console.error("Update listing error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
