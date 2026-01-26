import { NextRequest, NextResponse } from "next/server";
import { ListingService } from "@/lib/services/listing-service";
import { formatSSE, getStreamHeaders } from "@/lib/utils/streaming";

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
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const streaming = searchParams.get("streaming") === "true";

    if (streaming) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          controller.enqueue(encoder.encode(formatSSE({
            type: "start",
            total: 0,
            label: "Fetching listings from POS...",
          })));

          try {
            const result = await ListingService.syncListingsFromPos();

            if (result.success) {
              controller.enqueue(encoder.encode(formatSSE({
                type: "progress",
                current: result.synced,
                total: result.synced,
                label: `Processing ${result.synced} listings...`,
                success: result.synced,
                failed: 0,
              })));

              controller.enqueue(encoder.encode(formatSSE({
                type: "complete",
                current: result.synced,
                total: result.synced,
                success: result.created + result.updated,
                failed: 0,
                message: `Synced ${result.synced} listings (${result.created} new, ${result.updated} updated, ${result.linked} linked)`,
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
