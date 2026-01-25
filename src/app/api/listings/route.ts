import { NextRequest, NextResponse } from "next/server";
import { ListingService } from "@/lib/services/listing-service";

/**
 * GET /api/listings
 * Fetch listings from local database with filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      isMatched:
        searchParams.get("isMatched") === "true"
          ? true
          : searchParams.get("isMatched") === "false"
          ? false
          : undefined,
      hasExtPO:
        searchParams.get("hasExtPO") === "true"
          ? true
          : searchParams.get("hasExtPO") === "false"
          ? false
          : undefined,
      search: searchParams.get("search") || undefined,
      eventName: searchParams.get("eventName") || undefined,
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "50", 10),
    };

    const result = await ListingService.getListings(filters);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Get listings error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/listings
 * Trigger full sync from POS
 */
export async function POST() {
  try {
    const result = await ListingService.syncListingsFromPos();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    const { success: _, ...restResult } = result;
    return NextResponse.json({
      success: true,
      message: `Synced ${result.synced} listings from POS`,
      ...restResult,
    });
  } catch (error) {
    console.error("Sync listings error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
