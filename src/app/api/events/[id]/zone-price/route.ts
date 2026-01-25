import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getGetInPriceFromUrl } from "@/lib/services/vivid-seats-scraper";
import { saveZonePrices, saveVenueMap } from "@/lib/services/event-sync";

// No stale enforcement - user controls when to refresh via UI

interface ZonePriceRecord {
  zone_name: string;
  min_price: number;
  scraped_at: Date;
}

/**
 * GET /api/events/[id]/zone-price?zoneName=Floor%20Seating
 * Get cached zone price for an event
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const { searchParams } = new URL(request.url);
    const zoneName = searchParams.get("zoneName");

    if (!zoneName) {
      return NextResponse.json(
        { error: "zoneName query parameter is required" },
        { status: 400 }
      );
    }

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, eventName: true },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Query existing zone price
    const zonePrices: ZonePriceRecord[] = await prisma.$queryRaw`
      SELECT zone_name, min_price, scraped_at
      FROM event_zone_prices 
      WHERE event_id = ${eventId} AND zone_name = ${zoneName}
    `;

    if (zonePrices.length > 0) {
      const zp = zonePrices[0];
      const scrapedAt = new Date(zp.scraped_at);
      
      return NextResponse.json({
        success: true,
        zoneName: zp.zone_name,
        minPrice: Number(zp.min_price),
        scrapedAt: scrapedAt.toISOString(),
        source: "cached",
      });
    }

    return NextResponse.json({
      success: true,
      zoneName,
      minPrice: null,
      source: "not_found",
    });
  } catch (error) {
    console.error("Get zone price error:", error);
    return NextResponse.json(
      { error: "Failed to get zone price", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/events/[id]/zone-price
 * Fetch zone price - check DB first, if not found or stale, scrape from Vivid Seats
 * Body: { zoneName: "Floor Seating", forceRefresh?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const body = await request.json();
    const { zoneName, forceRefresh = false } = body;

    if (!zoneName) {
      return NextResponse.json(
        { error: "zoneName is required" },
        { status: 400 }
      );
    }

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

    // Check for cached zone price first (unless force refresh)
    // Return cached data if available (unless forceRefresh is true)
    if (!forceRefresh) {
      const cachedPrices: ZonePriceRecord[] = await prisma.$queryRaw`
        SELECT zone_name, min_price, scraped_at
        FROM event_zone_prices 
        WHERE event_id = ${eventId} AND zone_name = ${zoneName}
      `;

      if (cachedPrices.length > 0) {
        const zp = cachedPrices[0];
        const scrapedAt = new Date(zp.scraped_at);

        // Always return cached data - user controls when to refresh
        return NextResponse.json({
          success: true,
          zoneName: zp.zone_name,
          minPrice: Number(zp.min_price),
          scrapedAt: scrapedAt.toISOString(),
          source: "cached",
        });
      }
    }

    // Need to scrape - check if we have a Vivid Seats URL
    if (!event.get_in_price_url) {
      return NextResponse.json(
        { 
          error: "No Vivid Seats URL saved for this event. Please sync event prices first or manually add the URL in the event edit page.",
          code: "NO_VIVID_URL"
        },
        { status: 400 }
      );
    }

    console.log(`[ZonePrice] Scraping zone prices for event ${event.event_name} from ${event.get_in_price_url}`);

    // Scrape all zone prices from the saved URL
    const priceData = await getGetInPriceFromUrl(event.get_in_price_url);

    if (priceData.error && !priceData.zonePrices?.length) {
      return NextResponse.json(
        { 
          error: priceData.error || "Failed to scrape zone prices",
          code: "SCRAPE_FAILED"
        },
        { status: 500 }
      );
    }

    // Save all scraped zone prices to DB
    if (priceData.zonePrices && priceData.zonePrices.length > 0) {
      await saveZonePrices(eventId, priceData.zonePrices);
      console.log(`[ZonePrice] Saved ${priceData.zonePrices.length} zone prices for event ${eventId}`);
      
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
        console.log(`[ZonePrice] Saved venue map for event ${eventId}: ${priceData.venueMap.venueName}`);
      }
    }

    // Find the requested zone in scraped results
    const requestedZone = priceData.zonePrices?.find(
      zp => zp.zoneName.toLowerCase() === zoneName.toLowerCase()
    );

    if (requestedZone) {
      return NextResponse.json({
        success: true,
        zoneName: requestedZone.zoneName,
        minPrice: requestedZone.minPrice,
        scrapedAt: priceData.scrapedAt,
        source: "scraped",
        allZones: priceData.zonePrices,
      });
    }

    // Zone not found in scraped results
    return NextResponse.json({
      success: true,
      zoneName,
      minPrice: null,
      source: "scraped",
      message: `Zone "${zoneName}" not found on Vivid Seats`,
      availableZones: priceData.zonePrices?.map(zp => zp.zoneName) || [],
    });

  } catch (error) {
    console.error("Fetch zone price error:", error);
    return NextResponse.json(
      { error: "Failed to fetch zone price", details: String(error) },
      { status: 500 }
    );
  }
}
