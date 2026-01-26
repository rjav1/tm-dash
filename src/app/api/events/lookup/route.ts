import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { TicketmasterEvent, findMatchingEvent } from "@/lib/services/ticketmaster";
import { getGetInPrice, VividSeatsPrice } from "@/lib/services/vivid-seats-scraper";
import { scrapeEventPageFetch, ScrapedEventData } from "@/lib/services/ticketmaster-fetch-scraper";

// Use fetch-based scraper (works on Vercel) instead of Puppeteer-based one
const scrapeEventPage = scrapeEventPageFetch;

/**
 * Helper to parse a date string into YYYY-MM-DD format for Discovery API
 */
function parseDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Try parsing various date formats
  const cleanDate = dateStr
    .replace(/\bat\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  
  try {
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  } catch {
    // Try regex extraction for formats like "September 12, 2026"
    const match = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (match) {
      const months: Record<string, string> = {
        january: "01", february: "02", march: "03", april: "04",
        may: "05", june: "06", july: "07", august: "08",
        september: "09", october: "10", november: "11", december: "12",
      };
      const month = months[match[1].toLowerCase()];
      if (month) {
        const day = match[2].padStart(2, "0");
        return `${match[3]}-${month}-${day}`;
      }
    }
  }
  return null;
}

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

      if (existingEvent && (existingEvent.eventName || existingEvent.artistName)) {
        searchArtist = existingEvent.artistName || existingEvent.eventName || null;
        searchVenue = existingEvent.venue || null;
        searchDate = existingEvent.eventDateRaw || existingEvent.eventDate?.toISOString().split("T")[0] || null;
        source = "database";
        
        // Create scrapedData from database to prevent Discovery API override
        scrapedData = {
          eventName: existingEvent.eventName || existingEvent.artistName || null,
          artistName: existingEvent.artistName || null,
          venue: existingEvent.venue || null,
          venueCity: null,
          venueState: null,
          date: existingEvent.eventDateRaw || null,
          time: null,
          dayOfWeek: existingEvent.dayOfWeek || null,
          url: `https://www.ticketmaster.com/event/${eventId}`,
          scrapedAt: new Date().toISOString(),
        };
      }
    }

    // Step 2b: If we still don't have data, try to get it from checkout jobs
    // The Discord webhook contains event info that's stored in checkout jobs
    if (!scrapedData?.eventName && eventId) {
      const checkoutJob = await prisma.checkoutJob.findFirst({
        where: { tmEventId: eventId },
        orderBy: { createdAt: "desc" },
      });

      if (checkoutJob) {
        searchArtist = checkoutJob.eventName || null;
        searchVenue = checkoutJob.venue || null;
        searchDate = checkoutJob.eventDate || null;
        source = "database";

        // Create scraped data from checkout job
        if (checkoutJob.eventName) {
          scrapedData = {
            eventName: checkoutJob.eventName,
            artistName: checkoutJob.eventName, // Use event name as artist for now
            venue: checkoutJob.venue || null,
            venueCity: null,
            venueState: null,
            date: checkoutJob.eventDate || null,
            time: null,
            dayOfWeek: null,
            url: `https://www.ticketmaster.com/event/${eventId}`,
            scrapedAt: new Date().toISOString(),
          };
        }
      }
    }

    // Note: Discovery API is disabled because it returns unreliable results
    // (e.g., searching "Harry Styles" may return a dance party instead of the concert)
    // We only use data from: scraping, database, or checkout jobs
    const tmEvent: TicketmasterEvent | null = null;

    // Step 3: If we still don't have artist name, return error with helpful message
    if (!searchArtist) {
      return NextResponse.json(
        {
          success: false,
          source,
          ticketmaster: tmEvent,
          scraped: scrapedData,
          vividSeats: null,
          searchParams: { artistName: null, venue: searchVenue, date: searchDate },
          error: "Could not sync event details automatically. Ticketmaster blocks server-side requests. Please enter the event details manually from the Discord webhook or event page.",
        } as EventLookupResponse,
        { status: 400 }
      );
    }

    // Step 4: Scrape Vivid Seats for pricing (if enabled)
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

    // Step 5: Return combined response
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

      if (existingEvent && (existingEvent.eventName || existingEvent.artistName)) {
        searchArtist = existingEvent.artistName || existingEvent.eventName || null;
        searchVenue = existingEvent.venue || null;
        searchDate = existingEvent.eventDateRaw || existingEvent.eventDate?.toISOString().split("T")[0] || null;
        source = "database";
        
        // Create scrapedData from database to prevent Discovery API override
        scrapedData = {
          eventName: existingEvent.eventName || existingEvent.artistName || null,
          artistName: existingEvent.artistName || null,
          venue: existingEvent.venue || null,
          venueCity: null,
          venueState: null,
          date: existingEvent.eventDateRaw || null,
          time: null,
          dayOfWeek: existingEvent.dayOfWeek || null,
          url: `https://www.ticketmaster.com/event/${eventId}`,
          scrapedAt: new Date().toISOString(),
        };
      }
    }

    // Step 2b: If we still don't have data, try to get it from checkout jobs
    if (!scrapedData?.eventName && eventId) {
      const checkoutJob = await prisma.checkoutJob.findFirst({
        where: { tmEventId: eventId },
        orderBy: { createdAt: "desc" },
      });

      if (checkoutJob) {
        searchArtist = checkoutJob.eventName || null;
        searchVenue = checkoutJob.venue || null;
        searchDate = checkoutJob.eventDate || null;
        source = "database";

        if (checkoutJob.eventName) {
          scrapedData = {
            eventName: checkoutJob.eventName,
            artistName: checkoutJob.eventName,
            venue: checkoutJob.venue || null,
            venueCity: null,
            venueState: null,
            date: checkoutJob.eventDate || null,
            time: null,
            dayOfWeek: null,
            url: `https://www.ticketmaster.com/event/${eventId}`,
            scrapedAt: new Date().toISOString(),
          };
        }
      }
    }

    // Note: Discovery API disabled - returns unreliable/wrong results
    // (e.g., searching "Harry Styles" returned a dance party instead of the actual concert)
    const tmEvent: TicketmasterEvent | null = null;

    if (!searchArtist) {
      return NextResponse.json(
        {
          success: false,
          source,
          ticketmaster: tmEvent,
          scraped: scrapedData,
          vividSeats: null,
          searchParams: { artistName: null, venue: searchVenue, date: searchDate },
          error: "Could not sync event details automatically. Ticketmaster blocks server-side requests. Please enter the event details manually from the Discord webhook or event page.",
        } as EventLookupResponse,
        { status: 400 }
      );
    }

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
