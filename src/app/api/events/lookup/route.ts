import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { TicketmasterEvent } from "@/lib/services/ticketmaster";
import { VividSeatsPrice } from "@/lib/services/vivid-seats-scraper";
import { ScrapedEventData } from "@/lib/services/ticketmaster-fetch-scraper";

// Constants
const SCRAPE_TIMEOUT_MS = 30000; // 30 seconds to wait for VPS scraper
const POLL_INTERVAL_MS = 500; // Poll every 500ms

export interface EventLookupRequest {
  eventId?: string;        // TM internal event ID (from queue/Discord webhook)
  artistName?: string;     // Artist name to search
  venue?: string;          // Venue name
  date?: string;           // Event date (YYYY-MM-DD or readable format)
  includeVividSeats?: boolean; // Whether to scrape VS for pricing (default: true)
}

export interface EventLookupResponse {
  success: boolean;
  source: "database" | "api" | "search" | "scrape" | "vps";
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
 * Check if the VPS scraper is online (has recent heartbeat)
 */
async function isScraperOnline(): Promise<boolean> {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    const run = await prisma.scrapeRun.findFirst({
      where: {
        status: "RUNNING",
        lastHeartbeat: { gte: thirtySecondsAgo },
      },
    });
    return !!run;
  } catch {
    return false;
  }
}

/**
 * Create a scrape job and wait for the VPS daemon to complete it
 */
async function requestVpsScrape(
  type: "TICKETMASTER_EVENT" | "VIVID_SEATS_PRICE",
  inputData: Record<string, unknown>
): Promise<{ success: boolean; data: Record<string, unknown> | null; error?: string }> {
  try {
    // Create the scrape job
    const job = await prisma.scrapeJob.create({
      data: {
        type,
        status: "QUEUED",
        inputData: JSON.stringify(inputData),
      },
    });

    console.log(`[Lookup] Created scrape job ${job.id} (${type})`);

    // Poll for completion
    const startTime = Date.now();
    while (Date.now() - startTime < SCRAPE_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const updatedJob = await prisma.scrapeJob.findUnique({
        where: { id: job.id },
      });

      if (!updatedJob) {
        return { success: false, data: null, error: "Job disappeared" };
      }

      if (updatedJob.status === "SUCCESS") {
        const outputData = updatedJob.outputData ? JSON.parse(updatedJob.outputData) : null;
        console.log(`[Lookup] Scrape job ${job.id} completed successfully`);
        return { success: true, data: outputData };
      }

      if (updatedJob.status === "FAILED") {
        console.log(`[Lookup] Scrape job ${job.id} failed: ${updatedJob.errorMessage}`);
        return {
          success: false,
          data: updatedJob.outputData ? JSON.parse(updatedJob.outputData) : null,
          error: updatedJob.errorMessage || "Scrape failed",
        };
      }
    }

    // Timeout - mark job as failed
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorCode: "TIMEOUT",
        errorMessage: "VPS scraper did not respond in time",
        completedAt: new Date(),
      },
    });

    return { success: false, data: null, error: "Scraper timeout - VPS may be offline" };
  } catch (error) {
    console.error("[Lookup] VPS scrape error:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * POST /api/events/lookup
 * 
 * Lookup event details from Ticketmaster and get pricing from Vivid Seats
 * Uses VPS-based scraping for reliable results
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

    // Step 1: Check if VPS scraper is online and try scraping TM page
    if (eventId) {
      const scraperOnline = await isScraperOnline();
      
      if (scraperOnline) {
        console.log(`[Lookup] VPS scraper online, requesting TM scrape for: ${eventId}`);
        const result = await requestVpsScrape("TICKETMASTER_EVENT", { eventId });
        
        if (result.success && result.data) {
          const data = result.data as unknown as ScrapedEventData;
          if (data.eventName) {
            source = "vps";
            scrapedData = data;
            searchArtist = data.artistName || data.eventName;
            
            if (data.venue) {
              const venueParts = [data.venue];
              if (data.venueCity) venueParts.push(data.venueCity);
              if (data.venueState) venueParts.push(data.venueState);
              searchVenue = venueParts.join(", ");
            }
            
            if (data.date) {
              searchDate = data.date;
              if (data.time) {
                searchDate += ` at ${data.time}`;
              }
            }
          }
        }
      } else {
        console.log(`[Lookup] VPS scraper offline, skipping TM scrape`);
      }
    }

    // Step 2: If VPS scraping failed or was offline, fall back to database lookup
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

    // Step 2b: Try checkout jobs as fallback
    if (!scrapedData?.eventName && eventId) {
      const checkoutJob = await prisma.checkoutJob.findFirst({
        where: { tmEventId: eventId },
        orderBy: { createdAt: "desc" },
      });

      if (checkoutJob?.eventName) {
        searchArtist = checkoutJob.eventName;
        searchVenue = checkoutJob.venue || null;
        searchDate = checkoutJob.eventDate || null;
        source = "database";

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

    // Step 3: If we still don't have artist name, return error
    if (!searchArtist) {
      const scraperOnline = await isScraperOnline();
      return NextResponse.json(
        {
          success: false,
          source,
          ticketmaster: null,
          scraped: scrapedData,
          vividSeats: null,
          searchParams: { artistName: null, venue: searchVenue, date: searchDate },
          error: scraperOnline
            ? "Could not extract event details from Ticketmaster page."
            : "VPS scraper is offline. Please enter event details manually or start the scraper.",
        } as EventLookupResponse,
        { status: 400 }
      );
    }

    // Step 4: Scrape Vivid Seats for pricing (via VPS if online)
    let vsPrice: VividSeatsPrice | null = null;
    
    if (includeVividSeats) {
      const scraperOnline = await isScraperOnline();
      
      if (scraperOnline) {
        console.log(`[Lookup] Requesting VS price scrape for: ${searchArtist}`);
        const result = await requestVpsScrape("VIVID_SEATS_PRICE", {
          artistName: searchArtist,
          venue: scrapedData?.venue || searchVenue || undefined,
          date: scrapedData?.date || searchDate || undefined,
        });
        
        if (result.data) {
          vsPrice = result.data as unknown as VividSeatsPrice;
        } else {
          vsPrice = {
            getInPrice: null,
            zonePrices: [],
            currency: "USD",
            url: null,
            scrapedAt: new Date().toISOString(),
            error: result.error || "VPS scrape failed",
          };
        }
      } else {
        vsPrice = {
          getInPrice: null,
          zonePrices: [],
          currency: "USD",
          url: null,
          scrapedAt: new Date().toISOString(),
          error: "VPS scraper is offline",
        };
      }
    }

    // Step 5: Return combined response
    const response: EventLookupResponse = {
      success: scrapedData?.eventName !== null,
      source,
      ticketmaster: null,
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
 * Simpler GET endpoint - delegates to POST
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const body: EventLookupRequest = {
    eventId: searchParams.get("eventId") || undefined,
    artistName: searchParams.get("artistName") || undefined,
    venue: searchParams.get("venue") || undefined,
    date: searchParams.get("date") || undefined,
    includeVividSeats: searchParams.get("includeVividSeats") !== "false",
  };

  // Create a fake request with JSON body
  const fakeRequest = new NextRequest(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return POST(fakeRequest);
}
