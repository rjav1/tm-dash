import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getGetInPriceFromUrl } from "@/lib/services/vivid-seats-scraper";
import { saveZonePrices, saveVenueMap } from "@/lib/services/event-sync";

/**
 * POST /api/events/[id]/sync-prices
 * Sync all zone prices and section data for a single event
 * Body: { forceRefresh?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const body = await request.json().catch(() => ({}));
    const { forceRefresh = true } = body;

    // Get event with Vivid Seats URL
    const eventData: Array<{
      id: string;
      event_name: string;
      get_in_price_url: string | null;
    }> = await prisma.$queryRaw`
      SELECT id, event_name, get_in_price_url
      FROM events WHERE id = ${eventId}
    `;

    if (eventData.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    const event = eventData[0];

    // Need to have a Vivid Seats URL to sync
    if (!event.get_in_price_url) {
      return NextResponse.json(
        { 
          error: "No Vivid Seats URL saved for this event. Please sync event info first or manually add the URL.",
          code: "NO_VIVID_URL"
        },
        { status: 400 }
      );
    }

    console.log(`[SyncPrices] Syncing zone prices for event ${event.event_name} from ${event.get_in_price_url}`);

    // Scrape all zone prices from the saved URL (force refresh to bypass cache)
    const priceData = await getGetInPriceFromUrl(event.get_in_price_url, true);

    if (priceData.error && !priceData.zonePrices?.length) {
      return NextResponse.json(
        { 
          error: priceData.error || "Failed to scrape zone prices",
          code: "SCRAPE_FAILED"
        },
        { status: 500 }
      );
    }

    let zoneCount = 0;
    let sectionCount = 0;

    // Save all scraped zone prices to DB
    if (priceData.zonePrices && priceData.zonePrices.length > 0) {
      await saveZonePrices(eventId, priceData.zonePrices);
      zoneCount = priceData.zonePrices.length;
      sectionCount = priceData.zonePrices.reduce((acc, z) => acc + (z.sections?.length || 0), 0);
      console.log(`[SyncPrices] Saved ${zoneCount} zone prices for event ${eventId}`);
      
      // Also save venue map and section mappings if available
      if (priceData.venueMap) {
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
        
        // Update the event's venueId for linking
        await prisma.$executeRaw`
          UPDATE events SET venue_id = ${priceData.venueMap.venueId}, updated_at = NOW()
          WHERE id = ${eventId}
        `;
        console.log(`[SyncPrices] Saved venue map for event ${eventId}: ${priceData.venueMap.venueName}`);
      }
    }

    // Update the event's get-in price if we have one
    if (priceData.getInPrice) {
      await prisma.$executeRaw`
        UPDATE events 
        SET get_in_price = ${priceData.getInPrice}, 
            get_in_price_updated_at = NOW(),
            updated_at = NOW()
        WHERE id = ${eventId}
      `;
    }

    return NextResponse.json({
      success: true,
      eventId,
      eventName: event.event_name,
      zoneCount,
      sectionCount,
      getInPrice: priceData.getInPrice,
      scrapedAt: priceData.scrapedAt,
    });

  } catch (error) {
    console.error("Sync prices error:", error);
    return NextResponse.json(
      { error: "Failed to sync prices", details: String(error) },
      { status: 500 }
    );
  }
}
