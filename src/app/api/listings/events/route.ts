import { NextResponse } from "next/server";
import { ListingService } from "@/lib/services/listing-service";

/**
 * GET /api/listings/events
 * Get list of unique event names for filter dropdown
 */
export async function GET() {
  try {
    const events = await ListingService.getListingEvents();

    return NextResponse.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error("Get listing events error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
