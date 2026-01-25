import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus, Prisma } from "@prisma/client";
import { createEvent } from "@/lib/services/event-sync";

// POST /api/events - Create a new event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      tmEventId, 
      artistName, 
      eventName, 
      venue, 
      dayOfWeek, 
      eventDateRaw,
      getInPrice,
      getInPriceUrl,
      getInPriceSource,
    } = body;

    if (!tmEventId) {
      return NextResponse.json(
        { success: false, error: "tmEventId is required" },
        { status: 400 }
      );
    }

    // Use shared createEvent function
    const event = await createEvent({
      tmEventId,
      artistName,
      eventName,
      venue,
      dayOfWeek,
      eventDateRaw,
      getInPrice,
      getInPriceUrl,
      getInPriceSource,
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: `Event with ID ${tmEventId} already exists` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Event creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create event" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const skip = (page - 1) * limit;
    const search = searchParams.get("search") || "";
    const sortBy = searchParams.get("sortBy") || "updatedAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build where clause
    const where: Prisma.EventWhereInput = {};
    if (search) {
      where.OR = [
        { eventName: { contains: search, mode: "insensitive" } },
        { artistName: { contains: search, mode: "insensitive" } },
        { venue: { contains: search, mode: "insensitive" } },
        { tmEventId: { contains: search, mode: "insensitive" } },
      ];
    }

    // Build orderBy - handle special cases for stats-based sorting
    const validSortFields = ["eventName", "artistName", "venue", "eventDate", "updatedAt", "getInPrice", "queueTests", "purchases"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "updatedAt";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";
    
    // For stats-based sorting, we need to fetch all events, calculate stats, sort, then paginate
    // For direct field sorting, use Prisma orderBy with pagination
    const needsStatsSorting = ["queueTests", "purchases", "getInPrice"].includes(orderField);
    let orderBy: Prisma.EventOrderByWithRelationInput | undefined;
    
    if (!needsStatsSorting && ["eventName", "artistName", "venue", "eventDate", "updatedAt"].includes(orderField)) {
      orderBy = { [orderField]: orderDir };
    } else if (orderField === "eventDate") {
      // Ensure eventDate sorting works properly
      orderBy = { eventDate: orderDir };
    }

    // Fetch events - if sorting by stats, fetch all; otherwise use pagination
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy,
        skip: needsStatsSorting ? 0 : skip,
        take: needsStatsSorting ? undefined : limit,
        include: {
          _count: {
            select: {
              queuePositions: {
                where: { excluded: false },
              },
              purchases: true,
            },
          },
        },
      }),
      prisma.event.count({ where }),
    ]);

    // Get get-in prices using raw query (needed until Prisma client regenerated)
    const eventIds = events.map(e => e.id);
    const getInPrices: Array<{id: string, get_in_price: number | null, get_in_price_url: string | null, get_in_price_source: string | null, get_in_price_updated_at: Date | null}> = eventIds.length > 0 
      ? await prisma.$queryRaw`
          SELECT id, get_in_price, get_in_price_url, get_in_price_source, get_in_price_updated_at 
          FROM events WHERE id = ANY(${eventIds}::text[])
        `
      : [];
    
    const priceMap = new Map(getInPrices.map(p => [p.id, p]));

    // Get additional stats for each event (excluding excluded queue positions)
    let eventsWithStats = await Promise.all(
      events.map(async (event) => {
        const [avgQueue, successfulPurchases] = await Promise.all([
          prisma.queuePosition.aggregate({
            where: { eventId: event.id, excluded: false },
            _avg: { position: true },
          }),
          prisma.purchase.count({
            where: {
              eventId: event.id,
              status: PurchaseStatus.SUCCESS,
            },
          }),
        ]);

        const priceData = priceMap.get(event.id);

        return {
          id: event.id,
          tmEventId: event.tmEventId,
          artistName: event.artistName,
          eventName: event.eventName,
          venue: event.venue,
          eventDate: event.eventDate,
          dayOfWeek: event.dayOfWeek,
          eventDateRaw: event.eventDateRaw,
          createdAt: event.createdAt,
          getInPrice: priceData?.get_in_price ? Number(priceData.get_in_price) : null,
          getInPriceUrl: priceData?.get_in_price_url || null,
          getInPriceSource: priceData?.get_in_price_source || null,
          getInPriceUpdatedAt: priceData?.get_in_price_updated_at || null,
          stats: {
            queueTests: event._count.queuePositions,
            purchases: event._count.purchases,
            successfulPurchases,
            avgQueuePosition: Math.round(avgQueue._avg.position || 0),
          },
        };
      })
    );

    // Sort by stats-based fields if needed (after fetching all data)
    if (orderField === "queueTests" || orderField === "purchases" || orderField === "getInPrice") {
      eventsWithStats.sort((a, b) => {
        let aValue: number | null;
        let bValue: number | null;
        
        if (orderField === "queueTests") {
          aValue = a.stats.queueTests;
          bValue = b.stats.queueTests;
        } else if (orderField === "purchases") {
          aValue = a.stats.purchases;
          bValue = b.stats.purchases;
        } else if (orderField === "getInPrice") {
          aValue = a.getInPrice;
          bValue = b.getInPrice;
        } else {
          return 0;
        }
        
        // Handle null values - put them at the end
        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;
        
        const comparison = aValue - bValue;
        return orderDir === "asc" ? comparison : -comparison;
      });
      
      // Apply pagination after sorting
      const startIndex = skip;
      const endIndex = skip + limit;
      eventsWithStats = eventsWithStats.slice(startIndex, endIndex);
    }

    return NextResponse.json({
      events: eventsWithStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Events fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
