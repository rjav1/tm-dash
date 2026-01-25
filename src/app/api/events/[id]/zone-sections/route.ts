import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/events/[id]/zone-sections
 * Get all zones and their sections for an event's venue
 * Also includes cached zone prices if available
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const { searchParams } = new URL(request.url);
    const zoneName = searchParams.get("zoneName");

    // Get the event to find its venue
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        eventName: true,
        venue: true,
        venueId: true,
        zonePrices: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Try to find venue map if we have a venueId
    let venueMap = null;
    if (event.venueId) {
      venueMap = await prisma.venueMap.findUnique({
        where: { venueId: event.venueId },
        include: {
          zones: {
            include: {
              sections: true,
            },
            orderBy: { displayOrder: 'asc' },
            ...(zoneName ? { where: { zoneName } } : {}),
          },
        },
      });
    }

    // Build zone prices map for quick lookup and find latest scraped time
    const zonePriceMap = new Map<string, { minPrice: number; colorHex: string | null }>();
    let latestScrapedAt: Date | null = null;
    for (const zp of event.zonePrices) {
      zonePriceMap.set(zp.zoneName, {
        minPrice: Number(zp.minPrice),
        colorHex: zp.colorHex,
      });
      if (!latestScrapedAt || zp.scrapedAt > latestScrapedAt) {
        latestScrapedAt = zp.scrapedAt;
      }
    }

    // If we have a venue map, use its zone data
    if (venueMap) {
      // Query section prices using raw SQL (bypasses Prisma client regeneration issue)
      const sectionPricesRaw: Array<{section_name: string; min_price: number | null; zone_id: string}> = await prisma.$queryRaw`
        SELECT vsz.section_name, vsz.min_price, vz.id as zone_id
        FROM venue_section_zones vsz
        JOIN venue_zones vz ON vsz.venue_zone_id = vz.id
        WHERE vz.venue_map_id = ${venueMap.id}
      `;
      
      // Build a map of zone_id -> section prices
      const zoneSectionPricesMap = new Map<string, Array<{sectionName: string; minPrice: number | null}>>();
      for (const sp of sectionPricesRaw) {
        if (!zoneSectionPricesMap.has(sp.zone_id)) {
          zoneSectionPricesMap.set(sp.zone_id, []);
        }
        zoneSectionPricesMap.get(sp.zone_id)!.push({
          sectionName: sp.section_name,
          minPrice: sp.min_price ? Number(sp.min_price) : null
        });
      }
      
      const zones = venueMap.zones.map(zone => {
        const priceInfo = zonePriceMap.get(zone.zoneName);
        const sectionPrices = zoneSectionPricesMap.get(zone.id) || [];
        return {
          zoneName: zone.zoneName,
          colorHex: zone.colorHex || priceInfo?.colorHex || null,
          sections: zone.sections.map(s => s.sectionName),
          // Include section-level prices for accurate comparison
          sectionPrices: sectionPrices,
          minPrice: priceInfo?.minPrice || null,
        };
      });

      return NextResponse.json({
        success: true,
        eventId,
        eventName: event.eventName,
        venueId: event.venueId,
        venueName: venueMap.venueName,
        staticMapUrl: venueMap.staticMapUrl,
        zones,
        scrapedAt: latestScrapedAt?.toISOString() || venueMap.scrapedAt?.toISOString() || null,
        source: "venue_map",
      });
    }

    // Fallback: use zone prices from the event (no section data available)
    const zones = event.zonePrices.map(zp => ({
      zoneName: zp.zoneName,
      colorHex: zp.colorHex,
      sections: [],
      minPrice: Number(zp.minPrice),
    }));

    return NextResponse.json({
      success: true,
      eventId,
      eventName: event.eventName,
      venueId: event.venueId,
      venueName: event.venue,
      staticMapUrl: null,
      zones,
      scrapedAt: latestScrapedAt?.toISOString() || null,
      source: "event_zone_prices",
    });
  } catch (error) {
    console.error("Get zone sections error:", error);
    return NextResponse.json(
      { error: "Failed to get zone sections", details: String(error) },
      { status: 500 }
    );
  }
}
