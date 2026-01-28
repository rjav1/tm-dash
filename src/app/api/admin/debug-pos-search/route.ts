import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { TicketVaultApi } from "@/lib/services/ticketvault-api";

/**
 * POST /api/admin/debug-pos-search
 * 
 * Debug POS event search for a specific purchase
 * Body: { purchaseId: string } or { eventId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchaseId, eventId } = body;
    
    const logs: string[] = [];
    
    let event;
    
    if (purchaseId) {
      const purchase = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        include: { event: true },
      });
      
      if (!purchase) {
        return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
      }
      
      event = purchase.event;
      logs.push(`Purchase: ${purchaseId}`);
      logs.push(`  Section: ${purchase.section}, Row: ${purchase.row}, Seats: ${purchase.seats}`);
    } else if (eventId) {
      event = await prisma.event.findUnique({
        where: { id: eventId },
      });
    } else {
      // Get first George Strait event
      event = await prisma.event.findFirst({
        where: {
          OR: [
            { artistName: { contains: "George Strait", mode: "insensitive" } },
            { eventName: { contains: "George Strait", mode: "insensitive" } },
          ],
        },
      });
    }
    
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    
    logs.push(`\nEvent from DB:`);
    logs.push(`  ID: ${event.id}`);
    logs.push(`  TM Event ID: ${event.tmEventId}`);
    logs.push(`  Artist: ${event.artistName}`);
    logs.push(`  Event Name: ${event.eventName}`);
    logs.push(`  Venue: ${event.venue}`);
    logs.push(`  Date Raw: ${event.eventDateRaw}`);
    logs.push(`  Date: ${event.eventDate}`);
    
    // Parse the date like pos-sync does
    let eventDateForSearch: Date | null = null;
    
    if (event.eventDateRaw) {
      const rawDate = event.eventDateRaw;
      const dateOnly = rawDate.split(" at ")[0];
      logs.push(`\nDate parsing:`);
      logs.push(`  Raw: "${rawDate}"`);
      logs.push(`  Date only: "${dateOnly}"`);
      
      let parsed = new Date(dateOnly);
      logs.push(`  new Date("${dateOnly}"): ${parsed.toString()}`);
      logs.push(`  Is valid: ${!isNaN(parsed.getTime())}`);
      
      if (isNaN(parsed.getTime())) {
        const months: Record<string, number> = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        };
        const match = dateOnly.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
        if (match) {
          const monthName = match[1].toLowerCase();
          const day = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);
          const month = months[monthName];
          logs.push(`  Manual parse: month=${monthName}(${month}), day=${day}, year=${year}`);
          if (month !== undefined) {
            parsed = new Date(Date.UTC(year, month, day, 12, 0, 0));
            logs.push(`  Manual parsed: ${parsed.toString()}`);
          }
        }
      }
      
      if (!isNaN(parsed.getTime())) {
        eventDateForSearch = parsed;
      }
    }
    
    if (!eventDateForSearch && event.eventDate) {
      eventDateForSearch = event.eventDate;
      logs.push(`  Using eventDate field: ${eventDateForSearch}`);
    }
    
    if (!eventDateForSearch) {
      logs.push(`\nERROR: Could not parse date`);
      return NextResponse.json({ success: false, logs, error: "Could not parse date" });
    }
    
    logs.push(`\nDate for search: ${eventDateForSearch.toISOString()}`);
    logs.push(`  UTC Date: ${eventDateForSearch.getUTCFullYear()}-${(eventDateForSearch.getUTCMonth()+1).toString().padStart(2,'0')}-${eventDateForSearch.getUTCDate().toString().padStart(2,'0')}`);
    
    // Format like the API does
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayName = days[eventDateForSearch.getUTCDay()];
    const monthName = months[eventDateForSearch.getUTCMonth()];
    const dayNum = eventDateForSearch.getUTCDate().toString().padStart(2, "0");
    const year = eventDateForSearch.getUTCFullYear();
    const formattedDate = `${dayName} ${monthName} ${dayNum} ${year}`;
    logs.push(`  Formatted for API: "${formattedDate}"`);
    
    // Extract venue
    const venue = event.venue || "";
    const venueParts = venue.split(",");
    const searchVenue = venueParts[0].trim();
    const venueFirstWord = searchVenue.split(/\s+/)[0] || "";
    
    logs.push(`\nVenue parsing:`);
    logs.push(`  Original: "${venue}"`);
    logs.push(`  Search venue: "${searchVenue}"`);
    logs.push(`  First word: "${venueFirstWord}"`);
    
    // Search name
    const searchName = event.artistName || event.eventName;
    logs.push(`\nSearch name: "${searchName}"`);
    
    // Now actually search
    logs.push(`\n--- Searching POS API ---`);
    logs.push(`Search params: name="${searchName}", venue="${searchVenue}", date="${formattedDate}"`);
    
    try {
      const events = await TicketVaultApi.searchEvents(
        searchName,
        eventDateForSearch,
        searchVenue
      );
      
      logs.push(`\nResults with full venue "${searchVenue}": ${events.length} events`);
      for (const e of events) {
        logs.push(`  - ${e.PrimaryEvent} | ${e.EventDateTime} | ${e.Venue} | ID: ${e.ProductionID}`);
      }
      
      if (events.length === 0) {
        // Try with first word
        logs.push(`\nRetrying with venue first word "${venueFirstWord}"...`);
        const retryEvents = await TicketVaultApi.searchEvents(
          searchName,
          eventDateForSearch,
          venueFirstWord
        );
        
        logs.push(`Results with "${venueFirstWord}": ${retryEvents.length} events`);
        for (const e of retryEvents) {
          logs.push(`  - ${e.PrimaryEvent} | ${e.EventDateTime} | ${e.Venue} | ID: ${e.ProductionID}`);
        }
        
        if (retryEvents.length === 0) {
          // Try with empty venue
          logs.push(`\nRetrying with empty venue...`);
          const emptyVenueEvents = await TicketVaultApi.searchEvents(
            searchName,
            eventDateForSearch,
            ""
          );
          
          logs.push(`Results with empty venue: ${emptyVenueEvents.length} events`);
          for (const e of emptyVenueEvents) {
            logs.push(`  - ${e.PrimaryEvent} | ${e.EventDateTime} | ${e.Venue} | ID: ${e.ProductionID}`);
          }
        }
      }
    } catch (searchError) {
      logs.push(`\nSearch error: ${searchError}`);
    }
    
    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Debug POS search error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
