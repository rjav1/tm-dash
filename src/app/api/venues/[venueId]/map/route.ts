import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/venues/[venueId]/map
 * Get venue map data including zones and sections
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;

    // Try to find existing venue map
    const venueMap = await prisma.venueMap.findUnique({
      where: { venueId },
      include: {
        zones: {
          include: {
            sections: true,
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!venueMap) {
      return NextResponse.json({
        success: false,
        error: "Venue map not found",
        venueId,
      }, { status: 404 });
    }

    // Transform data for response
    const zones = venueMap.zones.map(zone => ({
      id: zone.id,
      zoneName: zone.zoneName,
      colorHex: zone.colorHex,
      displayOrder: zone.displayOrder,
      sections: zone.sections.map(s => s.sectionName),
    }));

    return NextResponse.json({
      success: true,
      venueId: venueMap.venueId,
      venueName: venueMap.venueName,
      staticMapUrl: venueMap.staticMapUrl,
      svgFileName: venueMap.svgFileName,
      jsonFileName: venueMap.jsonFileName,
      scrapedAt: venueMap.scrapedAt,
      zones,
    });
  } catch (error) {
    console.error("Get venue map error:", error);
    return NextResponse.json(
      { error: "Failed to get venue map", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/venues/[venueId]/map
 * Create or update venue map data
 * Body: { venueName, staticMapUrl?, svgFileName?, jsonFileName?, zones: [{ zoneName, colorHex?, sections: string[] }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;
    const body = await request.json();
    const { venueName, staticMapUrl, svgFileName, jsonFileName, zones } = body;

    if (!venueName) {
      return NextResponse.json(
        { error: "venueName is required" },
        { status: 400 }
      );
    }

    // Upsert venue map
    const venueMap = await prisma.venueMap.upsert({
      where: { venueId },
      create: {
        venueId,
        venueName,
        staticMapUrl,
        svgFileName,
        jsonFileName,
        scrapedAt: new Date(),
      },
      update: {
        venueName,
        staticMapUrl,
        svgFileName,
        jsonFileName,
        scrapedAt: new Date(),
      },
    });

    // If zones are provided, update them
    if (zones && Array.isArray(zones)) {
      // Delete existing zones (cascade will delete sections)
      await prisma.venueZone.deleteMany({
        where: { venueMapId: venueMap.id },
      });

      // Create new zones with sections
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const createdZone = await prisma.venueZone.create({
          data: {
            venueMapId: venueMap.id,
            zoneName: zone.zoneName,
            colorHex: zone.colorHex || null,
            displayOrder: i,
          },
        });

        // Create sections for this zone
        if (zone.sections && Array.isArray(zone.sections)) {
          await prisma.venueSectionZone.createMany({
            data: zone.sections.map((sectionName: string) => ({
              venueZoneId: createdZone.id,
              sectionName,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // Fetch the complete updated venue map
    const updatedVenueMap = await prisma.venueMap.findUnique({
      where: { id: venueMap.id },
      include: {
        zones: {
          include: {
            sections: true,
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Venue map saved successfully",
      venueMap: updatedVenueMap,
    });
  } catch (error) {
    console.error("Save venue map error:", error);
    return NextResponse.json(
      { error: "Failed to save venue map", details: String(error) },
      { status: 500 }
    );
  }
}
