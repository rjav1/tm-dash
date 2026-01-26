/**
 * Unified Event Sync Service
 * 
 * Centralizes all event synchronization logic:
 * - Fetching event info from Ticketmaster
 * - Fetching prices from Vivid Seats
 * - Updating event records in the database
 * 
 * Used by:
 * - /api/events/sync-all (Sync Info button)
 * - /api/events/sync-prices (Sync Prices button)
 * - /api/events/lookup (Add Event dialog)
 * - /api/events POST (Create event)
 */

import prisma from "@/lib/db";
import { scrapeEventPageFetch as scrapeEventPage, ScrapedEventData } from "./ticketmaster-fetch-scraper";
import { getGetInPrice, getGetInPriceFromUrl, VividSeatsPrice, ZonePrice, clearPriceCache } from "./vivid-seats-scraper";

// ============================================
// Types
// ============================================

export interface EventSyncOptions {
  /** Sync event info from Ticketmaster */
  syncInfo?: boolean;
  /** Sync price from Vivid Seats */
  syncPrice?: boolean;
  /** Clear the price cache before syncing */
  clearCache?: boolean;
}

export interface EventSyncResult {
  success: boolean;
  eventId: string;
  eventName: string;
  
  // Info sync results
  scrapedData?: ScrapedEventData | null;
  infoUpdated?: boolean;
  
  // Price sync results  
  priceData?: VividSeatsPrice | null;
  priceUpdated?: boolean;
  
  // Error info
  error?: string;
}

export interface EventForSync {
  id: string;
  tmEventId: string;
  artistName: string | null;
  eventName: string;
  venue: string | null;
  eventDateRaw?: string | null;
  getInPriceUrl?: string | null;
}

export interface BatchSyncProgress {
  current: number;
  total: number;
  eventName: string;
  success: boolean;
  message?: string;
  price?: number | null;
}

export interface BatchSyncResult {
  total: number;
  synced: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ============================================
// Core Sync Functions
// ============================================

/**
 * Sync a single event's info and/or price
 */
export async function syncEvent(
  event: EventForSync,
  options: EventSyncOptions = { syncInfo: true, syncPrice: true }
): Promise<EventSyncResult> {
  const result: EventSyncResult = {
    success: false,
    eventId: event.id,
    eventName: event.eventName,
  };

  try {
    let scrapedData: ScrapedEventData | null = null;
    let venue = event.venue;
    let eventDateRaw = event.eventDateRaw || null;
    let artistName = event.artistName;

    // Step 1: Sync info from Ticketmaster (if requested)
    if (options.syncInfo && event.tmEventId && event.tmEventId.length <= 20) {
      try {
        scrapedData = await scrapeEventPage(event.tmEventId);
        result.scrapedData = scrapedData;

        if (scrapedData?.eventName) {
          // Build venue string
          venue = scrapedData.venue || null;
          if (scrapedData.venueCity) {
            venue = venue ? `${venue}, ${scrapedData.venueCity}` : scrapedData.venueCity;
          }
          if (scrapedData.venueState) {
            venue = venue ? `${venue}, ${scrapedData.venueState}` : scrapedData.venueState;
          }

          // Build date string
          eventDateRaw = scrapedData.date || null;
          if (scrapedData.time) {
            eventDateRaw = eventDateRaw ? `${eventDateRaw} at ${scrapedData.time}` : scrapedData.time;
          }

          artistName = scrapedData.artistName || artistName;
          result.infoUpdated = true;
        }
      } catch (scrapeError) {
        console.error(`[EventSync] Failed to scrape TM for ${event.eventName}:`, scrapeError);
        result.error = scrapeError instanceof Error ? scrapeError.message : "Scrape failed";
      }
    }

    // Step 2: Sync price from Vivid Seats (if requested)
    let priceData: VividSeatsPrice | null = null;
    if (options.syncPrice) {
      // Clear cache if requested (forces fresh data)
      const forceRefresh = options.clearCache === true;
      
      // If we have a saved Vivid Seats URL, use it directly instead of searching
      if (event.getInPriceUrl && event.getInPriceUrl.includes("vividseats.com")) {
        try {
          console.log(`[EventSync] Using saved URL for ${event.eventName}: ${event.getInPriceUrl} (forceRefresh: ${forceRefresh})`);
          priceData = await getGetInPriceFromUrl(event.getInPriceUrl, forceRefresh);
          result.priceData = priceData;
          result.priceUpdated = priceData.getInPrice !== null;
        } catch (priceError) {
          console.error(`[EventSync] Failed to fetch price from URL for ${event.eventName}:`, priceError);
          if (!result.error) {
            result.error = priceError instanceof Error ? priceError.message : "Price fetch from URL failed";
          }
        }
      } else {
        // No saved URL - search for the event
        const artistForPrice = artistName || event.artistName;
        
        if (!artistForPrice) {
          result.error = "Missing artist name for price lookup";
        } else {
          try {
            priceData = await getGetInPrice({
              artistName: artistForPrice,
              venue: scrapedData?.venue || event.venue || undefined,
              date: scrapedData?.date || eventDateRaw || undefined,
            });
            result.priceData = priceData;
            result.priceUpdated = priceData.getInPrice !== null;
          } catch (priceError) {
            console.error(`[EventSync] Failed to fetch price for ${artistForPrice}:`, priceError);
            if (!result.error) {
              result.error = priceError instanceof Error ? priceError.message : "Price fetch failed";
            }
          }
        }
      }
    }

    // Step 3: Update the database
    if (result.infoUpdated || result.priceUpdated) {
      await updateEventRecord(event.id, {
        artistName: scrapedData?.artistName || event.artistName,
        eventName: scrapedData?.eventName || event.eventName,
        venue: venue || event.venue,
        dayOfWeek: scrapedData?.dayOfWeek || null,
        eventDateRaw: eventDateRaw,
        getInPrice: priceData?.getInPrice || null,
        getInPriceUrl: priceData?.url || null,
        getInPriceSource: priceData?.getInPrice ? "vividseats" : null,
      });
      
      // Save zone prices if available
      if (priceData?.zonePrices && priceData.zonePrices.length > 0) {
        await saveZonePrices(event.id, priceData.zonePrices);
      }
      
      result.success = true;
    } else if (options.syncInfo && !scrapedData?.eventName) {
      result.error = result.error || "Could not scrape TM page";
    } else if (options.syncPrice && !priceData?.getInPrice) {
      result.error = result.error || priceData?.error || "No price found";
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

/**
 * Update event record in database using raw SQL
 * (Required because Prisma client may not be regenerated with new fields)
 */
export async function updateEventRecord(
  eventId: string,
  data: {
    artistName?: string | null;
    eventName?: string | null;
    venue?: string | null;
    dayOfWeek?: string | null;
    eventDateRaw?: string | null;
    getInPrice?: number | null;
    getInPriceUrl?: string | null;
    getInPriceSource?: string | null;
  }
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE events SET 
      artist_name = COALESCE(${data.artistName}, artist_name),
      event_name = COALESCE(${data.eventName}, event_name),
      venue = COALESCE(${data.venue}, venue),
      day_of_week = ${data.dayOfWeek},
      event_date_raw = COALESCE(${data.eventDateRaw}, event_date_raw),
      get_in_price = ${data.getInPrice},
      get_in_price_url = ${data.getInPriceUrl},
      get_in_price_source = ${data.getInPriceSource},
      get_in_price_updated_at = ${data.getInPrice ? new Date() : null},
      updated_at = NOW()
    WHERE id = ${eventId}
  `;
}

/**
 * Update only the price fields for an event
 */
export async function updateEventPrice(
  eventId: string,
  priceData: { getInPrice: number | null; url: string | null; zonePrices?: ZonePrice[] }
): Promise<void> {
  if (priceData.getInPrice) {
    await prisma.$executeRaw`
      UPDATE events SET 
        get_in_price = ${priceData.getInPrice},
        get_in_price_url = ${priceData.url},
        get_in_price_source = 'vividseats',
        get_in_price_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${eventId}
    `;
  }
  
  // Save zone prices if available
  if (priceData.zonePrices && priceData.zonePrices.length > 0) {
    await saveZonePrices(eventId, priceData.zonePrices);
  }
}

/**
 * Save zone-level pricing for an event
 * Upserts zone prices - updates if exists, creates if new
 * Now includes colorHex field
 */
export async function saveZonePrices(eventId: string, zonePrices: ZonePrice[]): Promise<void> {
  const now = new Date();
  
  for (const zp of zonePrices) {
    try {
      // Use raw SQL for upsert to avoid Prisma client regeneration issues
      await prisma.$executeRaw`
        INSERT INTO event_zone_prices (id, event_id, zone_name, min_price, color_hex, scraped_at)
        VALUES (
          gen_random_uuid()::text,
          ${eventId},
          ${zp.zoneName},
          ${zp.minPrice},
          ${zp.colorHex || null},
          ${now}
        )
        ON CONFLICT (event_id, zone_name) 
        DO UPDATE SET 
          min_price = ${zp.minPrice},
          color_hex = ${zp.colorHex || null},
          scraped_at = ${now}
      `;
    } catch (error) {
      console.error(`[EventSync] Failed to save zone price for ${zp.zoneName}:`, error);
    }
  }
}

/**
 * Save venue map and zone-section mappings
 * Creates or updates the venue map with zones and their sections
 */
export async function saveVenueMap(
  venueId: string,
  venueName: string,
  mapInfo: { staticMapUrl?: string | null; svgFileName?: string | null; jsonFileName?: string | null },
  zonePrices: ZonePrice[]
): Promise<void> {
  try {
    const now = new Date();
    
    // Upsert venue map
    await prisma.$executeRaw`
      INSERT INTO venue_maps (id, venue_id, venue_name, static_map_url, svg_file_name, json_file_name, scraped_at, created_at, updated_at)
      VALUES (
        gen_random_uuid()::text,
        ${venueId},
        ${venueName},
        ${mapInfo.staticMapUrl || null},
        ${mapInfo.svgFileName || null},
        ${mapInfo.jsonFileName || null},
        ${now},
        ${now},
        ${now}
      )
      ON CONFLICT (venue_id) 
      DO UPDATE SET 
        venue_name = ${venueName},
        static_map_url = COALESCE(${mapInfo.staticMapUrl || null}, venue_maps.static_map_url),
        svg_file_name = COALESCE(${mapInfo.svgFileName || null}, venue_maps.svg_file_name),
        json_file_name = COALESCE(${mapInfo.jsonFileName || null}, venue_maps.json_file_name),
        scraped_at = ${now},
        updated_at = ${now}
    `;
    
    // Get the venue map ID
    const venueMapResult: Array<{ id: string }> = await prisma.$queryRaw`
      SELECT id FROM venue_maps WHERE venue_id = ${venueId}
    `;
    
    if (venueMapResult.length === 0) {
      console.error(`[EventSync] Failed to find venue map for ${venueId}`);
      return;
    }
    
    const venueMapId = venueMapResult[0].id;
    
    // Process each zone with sections
    for (let i = 0; i < zonePrices.length; i++) {
      const zp = zonePrices[i];
      
      // Upsert zone
      await prisma.$executeRaw`
        INSERT INTO venue_zones (id, venue_map_id, zone_name, color_hex, display_order, created_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${venueMapId},
          ${zp.zoneName},
          ${zp.colorHex || null},
          ${i},
          ${now},
          ${now}
        )
        ON CONFLICT (venue_map_id, zone_name) 
        DO UPDATE SET 
          color_hex = COALESCE(${zp.colorHex || null}, venue_zones.color_hex),
          display_order = ${i},
          updated_at = ${now}
      `;
      
      // Get the zone ID
      const zoneResult: Array<{ id: string }> = await prisma.$queryRaw`
        SELECT id FROM venue_zones WHERE venue_map_id = ${venueMapId} AND zone_name = ${zp.zoneName}
      `;
      
      if (zoneResult.length > 0) {
        const zoneId = zoneResult[0].id;
        
        // IMPORTANT: Clear all existing sections for this zone before adding new ones
        // This ensures we only have official sections from the API, not stale seller-provided names
        await prisma.$executeRaw`
          DELETE FROM venue_section_zones WHERE venue_zone_id = ${zoneId}
        `;
        
        // Build a map of section name to price from sectionPrices
        const sectionPriceMap = new Map<string, number>();
        if (zp.sectionPrices && zp.sectionPrices.length > 0) {
          for (const sp of zp.sectionPrices) {
            sectionPriceMap.set(sp.sectionName, sp.minPrice);
          }
        }
        
        // Add official sections from the API with their prices
        if (zp.sections && zp.sections.length > 0) {
          for (const section of zp.sections) {
            try {
              const sectionPrice = sectionPriceMap.get(section) || null;
              await prisma.$executeRaw`
                INSERT INTO venue_section_zones (id, venue_zone_id, section_name, min_price, created_at)
                VALUES (
                  gen_random_uuid()::text,
                  ${zoneId},
                  ${section},
                  ${sectionPrice},
                  ${now}
                )
                ON CONFLICT (venue_zone_id, section_name) 
                DO UPDATE SET min_price = EXCLUDED.min_price
              `;
            } catch (sectionError) {
              // Ignore duplicate section errors
            }
          }
        }
      }
    }
    
    console.log(`[EventSync] Saved venue map for ${venueName} (${venueId}) with ${zonePrices.length} zones`);
  } catch (error) {
    console.error(`[EventSync] Failed to save venue map for ${venueId}:`, error);
  }
}

// ============================================
// Batch Sync with Streaming
// ============================================

/**
 * Create a streaming response for batch event sync
 */
export function createBatchSyncStream(
  events: EventForSync[],
  options: EventSyncOptions,
  onProgress?: (progress: BatchSyncProgress) => void
): ReadableStream {
  const encoder = new TextEncoder();

  // Clear cache if requested
  if (options.clearCache) {
    clearPriceCache();
  }

  return new ReadableStream({
    async start(controller) {
      const results: BatchSyncResult = {
        total: events.length,
        synced: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        
        // Skip events without proper TM event IDs for info sync
        if (options.syncInfo && (!event.tmEventId || event.tmEventId.length > 20)) {
          results.skipped++;
          results.failed++;
          results.errors.push(`${event.eventName}: Invalid event ID`);
          
          const progress: BatchSyncProgress = {
            current: i + 1,
            total: events.length,
            eventName: event.eventName,
            success: false,
            message: "Invalid event ID",
          };
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", ...progress })}\n\n`)
          );
          onProgress?.(progress);
          continue;
        }

        // Skip events without artist name for price-only sync
        if (!options.syncInfo && options.syncPrice && !event.artistName) {
          results.skipped++;
          results.errors.push(`${event.eventName}: Missing artist name`);
          
          const progress: BatchSyncProgress = {
            current: i + 1,
            total: events.length,
            eventName: event.eventName,
            success: false,
            message: "Missing artist name",
          };
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", ...progress })}\n\n`)
          );
          onProgress?.(progress);
          continue;
        }

        try {
          const syncResult = await syncEvent(event, options);
          
          if (syncResult.success) {
            results.synced++;
            
            const progress: BatchSyncProgress = {
              current: i + 1,
              total: events.length,
              eventName: event.eventName,
              success: true,
              price: syncResult.priceData?.getInPrice,
            };
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "progress", ...progress })}\n\n`)
            );
            onProgress?.(progress);
          } else {
            results.failed++;
            results.errors.push(`${event.eventName}: ${syncResult.error}`);
            
            const progress: BatchSyncProgress = {
              current: i + 1,
              total: events.length,
              eventName: event.eventName,
              success: false,
              message: syncResult.error,
            };
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "progress", ...progress })}\n\n`)
            );
            onProgress?.(progress);
          }
        } catch (error) {
          results.failed++;
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          results.errors.push(`${event.eventName}: ${errorMsg}`);
          
          const progress: BatchSyncProgress = {
            current: i + 1,
            total: events.length,
            eventName: event.eventName,
            success: false,
            message: errorMsg,
          };
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", ...progress })}\n\n`)
          );
          onProgress?.(progress);
        }

        // Delay between requests
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Send completion message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "complete", ...results })}\n\n`)
      );

      controller.close();
    },
  });
}

/**
 * Get events for syncing from database
 */
export async function getEventsForSync(eventIds?: string[]): Promise<EventForSync[]> {
  // Get events with basic Prisma fields
  const events = await prisma.event.findMany({
    where: eventIds ? { id: { in: eventIds } } : undefined,
    select: {
      id: true,
      tmEventId: true,
      artistName: true,
      eventName: true,
      venue: true,
      eventDateRaw: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // Also get the getInPriceUrl via raw query (in case Prisma client not regenerated)
  const ids = events.map(e => e.id);
  if (ids.length === 0) return events;

  const urlData: Array<{ id: string; get_in_price_url: string | null }> = await prisma.$queryRaw`
    SELECT id, get_in_price_url FROM events WHERE id = ANY(${ids}::text[])
  `;
  
  const urlMap = new Map(urlData.map(d => [d.id, d.get_in_price_url]));

  return events.map(e => ({
    ...e,
    getInPriceUrl: urlMap.get(e.id) || null,
  }));
}

/**
 * Create streaming HTTP response headers
 */
export function getStreamHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  };
}

// ============================================
// Event Creation
// ============================================

export interface CreateEventData {
  tmEventId: string;
  artistName?: string | null;
  eventName?: string | null;
  venue?: string | null;
  dayOfWeek?: string | null;
  eventDateRaw?: string | null;
  getInPrice?: number | null;
  getInPriceUrl?: string | null;
  getInPriceSource?: string | null;
}

export interface CreatedEvent {
  id: string;
  tmEventId: string;
  artistName: string | null;
  eventName: string;
  venue: string | null;
  dayOfWeek: string | null;
  eventDateRaw: string | null;
  getInPrice: number | null;
  getInPriceUrl: string | null;
  getInPriceSource: string | null;
}

/**
 * Create a new event with all fields properly handled
 * Returns null if event already exists
 */
export async function createEvent(data: CreateEventData): Promise<CreatedEvent | null> {
  // Check if event already exists
  const existing = await prisma.event.findUnique({
    where: { tmEventId: data.tmEventId },
  });

  if (existing) {
    return null;
  }

  // Create the event
  const event = await prisma.event.create({
    data: {
      tmEventId: data.tmEventId,
      artistName: data.artistName || null,
      eventName: data.eventName || data.tmEventId,
      venue: data.venue || null,
      dayOfWeek: data.dayOfWeek || null,
      eventDateRaw: data.eventDateRaw || null,
      getInPrice: data.getInPrice != null ? data.getInPrice : null,
      getInPriceUrl: data.getInPriceUrl || null,
      getInPriceSource: data.getInPriceSource || null,
      getInPriceUpdatedAt: data.getInPrice != null ? new Date() : null,
    },
  });

  return {
    id: event.id,
    tmEventId: event.tmEventId,
    artistName: event.artistName,
    eventName: event.eventName,
    venue: event.venue,
    dayOfWeek: event.dayOfWeek,
    eventDateRaw: event.eventDateRaw,
    getInPrice: event.getInPrice ? Number(event.getInPrice) : null,
    getInPriceUrl: event.getInPriceUrl,
    getInPriceSource: event.getInPriceSource,
  };
}

/**
 * Get or create an event (for imports)
 * Returns existing event if found, creates placeholder if not
 */
export async function getOrCreateEvent(
  tmEventId: string,
  eventData?: Partial<CreateEventData>
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.event.findUnique({
    where: { tmEventId },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, created: false };
  }

  const event = await prisma.event.create({
    data: {
      tmEventId,
      eventName: eventData?.eventName || `Event ${tmEventId}`,
      artistName: eventData?.artistName || null,
      venue: eventData?.venue || null,
      dayOfWeek: eventData?.dayOfWeek || null,
      eventDateRaw: eventData?.eventDateRaw || null,
    },
    select: { id: true },
  });

  return { id: event.id, created: true };
}
