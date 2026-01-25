import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { TicketmasterEvent } from "@/lib/services/ticketmaster";
import { getGetInPrice, VividSeatsPrice } from "@/lib/services/vivid-seats-scraper";
import { scrapeEventPage, ScrapedEventData } from "@/lib/services/ticketmaster-scraper";

export interface EventLookupRequest {
  eventId?: string;        // TM internal event ID (from queue/Discord webhook)
  artistName?: string;     // Artist name to search
  venue?: string;          // Venue name
  date?: string;           // Event date (YYYY-MM-DD or readable format)
  includeVividSeats?: boolean; // Whether to scrape VS for pricing (default: true)
}

export interface EventLookupResponse {
  success: boolean;
  source: "database" | "api" | "search" | "scrape";
  ticketmaster: TicketmasterEvent | null;
  scraped: ScrapedEventData | null;
  vividSeats: VividSeatsPrice | null;
  searchParams: {
    artistName: string | null;
    venue: string | null;
    date: string | null;
  };
  error?: string;
}

/**
 * POST /api/events/lookup
 * 
 * Lookup event details from Ticketmaster and get pricing from Vivid Seats
 * 
 * Request body:
 * {
 *   eventId?: string,        // Optional: TM event ID to check DB first
 *   artistName?: string,     // Required if event not in DB: artist to search
 *   venue?: string,          // Optional: venue to filter by
 *   date?: string,           // Optional: date to filter by
 *   includeVividSeats?: boolean // Default true: whether to scrape VS pricing
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body: EventLookupRequest = await request.json();
    const { eventId, artistName, venue, date, includeVividSeats = true } = body;

    let searchArtist: string | null = artistName || null;
    let searchVenue: string | null = venue || null;
    let searchDate: string | null = date || null;
    let source: EventLookupResponse["source"] = "search";
    let scrapedData: ScrapedEventData | null = null;

    // Step 1: If eventId is provided, ALWAYS try scraping the TM page first
    // This ensures we get fresh data when user clicks "Sync"
    if (eventId) {
      console.log(`[Lookup] Scraping TM page for event: ${eventId}`);
      try {
        scrapedData = await scrapeEventPage(eventId);
        
        if (scrapedData.eventName) {
          source = "scrape";
          // Use scraped data - this is the authoritative source
          searchArtist = scrapedData.artistName || scrapedData.eventName;
          
          if (scrapedData.venue) {
            const venueParts = [scrapedData.venue];
            if (scrapedData.venueCity) venueParts.push(scrapedData.venueCity);
            if (scrapedData.venueState) venueParts.push(scrapedData.venueState);
            searchVenue = venueParts.join(", ");
          }
          
          if (scrapedData.date) {
            searchDate = scrapedData.date;
            if (scrapedData.time) {
              searchDate += ` at ${scrapedData.time}`;
            }
          }
        }
      } catch (scrapeError) {
        console.error("TM page scraping failed:", scrapeError);
      }
    }

    // Step 2: If scraping failed or no eventId, fall back to database lookup
    if (!scrapedData?.eventName && eventId) {
      const existingEvent = await prisma.event.findFirst({
        where: {
          OR: [
            { tmEventId: eventId },
            { id: eventId },
          ],
        },
      });

      if (existingEvent) {
        searchArtist = searchArtist || existingEvent.artistName || null;
        searchVenue = searchVenue || existingEvent.venue || null;
        searchDate = searchDate || existingEvent.eventDateRaw || existingEvent.eventDate?.toISOString().split("T")[0] || null;
        if (source !== "scrape") {
          source = "database";
        }
      }
    }

    // Step 3: If we still don't have artist name, return error
    if (!searchArtist) {
      return NextResponse.json(
        {
          success: false,
          source,
          ticketmaster: null,
          scraped: scrapedData,
          vividSeats: null,
          searchParams: { artistName: null, venue: searchVenue, date: searchDate },
          error: "Could not determine event details. The event page may not exist or failed to load.",
        } as EventLookupResponse,
        { status: 400 }
      );
    }

    // Step 4: Skip Discovery API search - scraping gives us better data
    // The Discovery API often returns wrong results (tribute bands, etc.)
    const tmEvent: TicketmasterEvent | null = null;

    // Step 5: Scrape Vivid Seats for pricing (if enabled)
    let vsPrice: VividSeatsPrice | null = null;
    
    if (includeVividSeats) {
      try {
        vsPrice = await getGetInPrice({
          artistName: searchArtist,
          venue: scrapedData?.venue || searchVenue || undefined,
          date: scrapedData?.date || searchDate || undefined,
        });
      } catch (vsError) {
        console.error("Vivid Seats scraping failed:", vsError);
        vsPrice = {
          getInPrice: null,
          zonePrices: [],
          currency: "USD",
          url: null,
          scrapedAt: new Date().toISOString(),
          error: vsError instanceof Error ? vsError.message : "Scraping failed",
        };
      }
    }

    // Step 6: Return combined response
    const response: EventLookupResponse = {
      success: scrapedData?.eventName !== null,
      source,
      ticketmaster: tmEvent,
      scraped: scrapedData,
      vividSeats: vsPrice,
      searchParams: {
        artistName: searchArtist,
        venue: searchVenue,
        date: searchDate,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Event lookup error:", error);
    return NextResponse.json(
      {
        success: false,
        source: "search",
        ticketmaster: null,
        scraped: null,
        vividSeats: null,
        searchParams: { artistName: null, venue: null, date: null },
        error: error instanceof Error ? error.message : "Unknown error",
      } as EventLookupResponse,
      { status: 500 }
    );
  }
}

/**
 * GET /api/events/lookup?eventId=...&artistName=...&venue=...&date=...
 * 
 * Simpler GET endpoint for quick lookups
 * If only eventId is provided, will scrape the TM page directly
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const artistName = searchParams.get("artistName");
  const venue = searchParams.get("venue");
  const date = searchParams.get("date");
  const eventId = searchParams.get("eventId");
  const includeVividSeats = searchParams.get("includeVividSeats") !== "false";

  let searchArtist: string | null = artistName || null;
  let searchVenue: string | null = venue || null;
  let searchDate: string | null = date || null;
  let source: EventLookupResponse["source"] = "search";
  let scrapedData: ScrapedEventData | null = null;

  try {
    // Step 1: If eventId is provided, ALWAYS try scraping the TM page first
    if (eventId) {
      console.log(`[Lookup GET] Scraping TM page for event: ${eventId}`);
      try {
        scrapedData = await scrapeEventPage(eventId);
        
        if (scrapedData.eventName) {
          source = "scrape";
          searchArtist = scrapedData.artistName || scrapedData.eventName;
          
          if (scrapedData.venue) {
            const venueParts = [scrapedData.venue];
            if (scrapedData.venueCity) venueParts.push(scrapedData.venueCity);
            if (scrapedData.venueState) venueParts.push(scrapedData.venueState);
            searchVenue = venueParts.join(", ");
          }
          
          if (scrapedData.date) {
            searchDate = scrapedData.date;
            if (scrapedData.time) {
              searchDate += ` at ${scrapedData.time}`;
            }
          }
        }
      } catch (scrapeError) {
        console.error("TM page scraping failed:", scrapeError);
      }
    }

    // Step 2: If scraping failed or no eventId, fall back to database lookup
    if (!scrapedData?.eventName && eventId) {
      const existingEvent = await prisma.event.findFirst({
        where: {
          OR: [
            { tmEventId: eventId },
            { id: eventId },
          ],
        },
      });

      if (existingEvent) {
        searchArtist = searchArtist || existingEvent.artistName || null;
        searchVenue = searchVenue || existingEvent.venue || null;
        searchDate = searchDate || existingEvent.eventDateRaw || existingEvent.eventDate?.toISOString().split("T")[0] || null;
        if (source !== "scrape") {
          source = "database";
        }
      }
    }

    if (!searchArtist) {
      return NextResponse.json(
        {
          success: false,
          source,
          ticketmaster: null,
          scraped: scrapedData,
          vividSeats: null,
          searchParams: { artistName: null, venue: searchVenue, date: searchDate },
          error: "Could not determine event details. Provide artistName or a valid eventId.",
        } as EventLookupResponse,
        { status: 400 }
      );
    }

    // Skip Discovery API - scraping is more reliable
    const tmEvent: TicketmasterEvent | null = null;

    // Scrape Vivid Seats
    let vsPrice: VividSeatsPrice | null = null;
    if (includeVividSeats) {
      try {
        vsPrice = await getGetInPrice({
          artistName: searchArtist,
          venue: scrapedData?.venue || searchVenue || undefined,
          date: scrapedData?.date || searchDate || undefined,
        });
      } catch (vsError) {
        console.error("Vivid Seats scraping failed:", vsError);
        vsPrice = {
          getInPrice: null,
          zonePrices: [],
          currency: "USD",
          url: null,
          scrapedAt: new Date().toISOString(),
          error: vsError instanceof Error ? vsError.message : "Scraping failed",
        };
      }
    }

    return NextResponse.json({
      success: scrapedData?.eventName !== null,
      source,
      ticketmaster: tmEvent,
      scraped: scrapedData,
      vividSeats: vsPrice,
      searchParams: {
        artistName: searchArtist,
        venue: searchVenue,
        date: searchDate,
      },
    } as EventLookupResponse);

  } catch (error) {
    console.error("Event lookup error:", error);
    return NextResponse.json(
      {
        success: false,
        source: "search",
        ticketmaster: null,
        scraped: null,
        vividSeats: null,
        searchParams: { artistName: null, venue: null, date: null },
        error: error instanceof Error ? error.message : "Unknown error",
      } as EventLookupResponse,
      { status: 500 }
    );
  }
}
