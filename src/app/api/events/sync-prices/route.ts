import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { 
  getEventsForSync, 
  createBatchSyncStream, 
  getStreamHeaders,
  syncEvent,
  updateEventPrice,
  saveZonePrices,
  saveVenueMap,
} from "@/lib/services/event-sync";
import { getGetInPrice, getGetInPriceFromUrl } from "@/lib/services/vivid-seats-scraper";

/**
 * POST /api/events/sync-prices
 * Sync events' get-in prices from Vivid Seats (price only, no TM scraping)
 * Uses streaming for real-time progress updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventIds } = body;

    // Get events to sync
    const events = await getEventsForSync(eventIds);

    // Create streaming response with price sync only
    const stream = createBatchSyncStream(events, {
      syncInfo: false,
      syncPrice: true,
      clearCache: true, // Clear price cache for fresh prices
    });

    return new Response(stream, {
      headers: getStreamHeaders(),
    });
  } catch (error) {
    console.error("Sync prices error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync prices",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/events/sync-prices
 * Sync a single event's get-in price
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventId } = body;

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Get the event with getInPriceUrl via raw query
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        tmEventId: true,
        artistName: true,
        eventName: true,
        venue: true,
        eventDateRaw: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 }
      );
    }

    // Get the saved URL via raw query
    const urlResult: Array<{ get_in_price_url: string | null }> = await prisma.$queryRaw`
      SELECT get_in_price_url FROM events WHERE id = ${eventId}
    `;
    const savedUrl = urlResult[0]?.get_in_price_url;

    let priceData;
    
    // If we have a saved URL, use it directly
    // Always force refresh for single event sync to get latest prices
    if (savedUrl && savedUrl.includes("vividseats.com")) {
      console.log(`[SyncPrice] Using saved URL (force refresh): ${savedUrl}`);
      priceData = await getGetInPriceFromUrl(savedUrl, true);
    } else {
      // Otherwise, search for the event
      if (!event.artistName) {
        return NextResponse.json(
          { success: false, error: "Event missing artist name and no saved URL" },
          { status: 400 }
        );
      }

      // Get the get-in price using the shared function
      priceData = await getGetInPrice({
        artistName: event.artistName,
        venue: event.venue || undefined,
        date: event.eventDateRaw || undefined,
      });
    }

    if (priceData.getInPrice) {
      // Update get-in price
      await updateEventPrice(event.id, {
        getInPrice: priceData.getInPrice,
        url: priceData.url,
      });
      
      // Also save zone prices if available
      if (priceData.zonePrices && priceData.zonePrices.length > 0) {
        await saveZonePrices(event.id, priceData.zonePrices);
        console.log(`[SyncPrice] Saved ${priceData.zonePrices.length} zone prices for event ${eventId}`);
      }
      
      // Also save venue map and section mappings if available
      if (priceData.venueMap && priceData.zonePrices) {
        await saveVenueMap(
          priceData.venueMap.venueId,
          priceData.venueMap.venueName,
          {
            staticMapUrl: priceData.venueMap.staticMapUrl,
            svgFileName: priceData.venueMap.svgFileName,
            jsonFileName: priceData.venueMap.jsonFileName,
          },
          priceData.zonePrices
        );
        console.log(`[SyncPrice] Saved venue map for ${priceData.venueMap.venueName}`);
      }

      return NextResponse.json({
        success: true,
        price: priceData.getInPrice,
        url: priceData.url,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: priceData.error || "No price found",
      });
    }
  } catch (error) {
    console.error("Sync single price error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync price",
      },
      { status: 500 }
    );
  }
}
