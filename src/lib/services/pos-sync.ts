/**
 * POS Sync Service
 *
 * Handles syncing purchases from the dashboard to TicketVault POS.
 * Manages PO number generation and data mapping.
 */

import prisma from "@/lib/db";
import {
  TicketVaultApi,
  TicketVaultEvent,
  TicketVaultSaveTicketsResponse,
  TicketVaultPurchaseOrder,
  SplitType,
  SPLIT_TYPES,
} from "./ticketvault-api";

// =============================================================================
// Types
// =============================================================================

export interface PurchaseForSync {
  id: string;
  dashboardPoNumber: string | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  priceEach: number | null;
  totalPrice: number | null;
  posSyncedAt: Date | null;
  event: {
    eventName: string;
    venue: string | null;
    eventDate: Date | null;
  } | null;
}

export interface SyncResult {
  purchaseId: string;
  dashboardPoNumber: string;
  success: boolean;
  error?: string;
  posTicketGroupId?: number;
  posPurchaseOrderId?: number;
  posEventId?: number;
}

export interface BatchSyncResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  results: SyncResult[];
}

// =============================================================================
// PO Number Generation
// =============================================================================

const PO_NUMBER_SETTING_KEY = "next_dashboard_po_number";

/**
 * Get the next available dashboard PO number (6-digit, zero-padded)
 * Increments the counter in the settings table
 */
export async function getNextPoNumber(): Promise<string> {
  // Use a transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Get current value or create if doesn't exist
    let setting = await tx.setting.findUnique({
      where: { key: PO_NUMBER_SETTING_KEY },
    });

    let nextNumber: number;

    if (!setting) {
      // Start from 1
      nextNumber = 1;
      await tx.setting.create({
        data: {
          key: PO_NUMBER_SETTING_KEY,
          value: "2", // Next number after this one
        },
      });
    } else {
      nextNumber = parseInt(setting.value, 10);
      // Increment for next time
      await tx.setting.update({
        where: { key: PO_NUMBER_SETTING_KEY },
        data: { value: String(nextNumber + 1) },
      });
    }

    return nextNumber;
  });

  // Format as 6-digit zero-padded string
  return result.toString().padStart(6, "0");
}

/**
 * Assign a dashboard PO number to a purchase if it doesn't have one
 * Uses a transaction to ensure atomicity and prevent race conditions
 */
export async function assignPoNumber(purchaseId: string): Promise<string> {
  // Use a transaction to make the entire operation atomic
  const result = await prisma.$transaction(async (tx) => {
    // Check if purchase already has a PO number
    const purchase = await tx.purchase.findUnique({
      where: { id: purchaseId },
      select: { dashboardPoNumber: true },
    });

    if (purchase?.dashboardPoNumber) {
      return purchase.dashboardPoNumber;
    }

    // Get or create the counter setting
    let setting = await tx.setting.findUnique({
      where: { key: PO_NUMBER_SETTING_KEY },
    });

    let nextNumber: number;

    if (!setting) {
      nextNumber = 1;
      await tx.setting.create({
        data: {
          key: PO_NUMBER_SETTING_KEY,
          value: "2",
        },
      });
    } else {
      nextNumber = parseInt(setting.value, 10);
      await tx.setting.update({
        where: { key: PO_NUMBER_SETTING_KEY },
        data: { value: String(nextNumber + 1) },
      });
    }

    const poNumber = nextNumber.toString().padStart(6, "0");

    // Assign PO number to purchase in the same transaction
    await tx.purchase.update({
      where: { id: purchaseId },
      data: { dashboardPoNumber: poNumber },
    });

    return poNumber;
  });

  return result;
}

// =============================================================================
// Seat Parsing
// =============================================================================

/**
 * Parse seats string to get start and end seat numbers
 * Handles formats like "12-17", "5,6,7", "12", etc.
 */
export function parseSeats(
  seats: string | null,
  quantity: number
): { startSeat: number; endSeat: number } {
  if (!seats) {
    // Default to sequential seats starting at 1
    return { startSeat: 1, endSeat: quantity };
  }

  // Handle range format: "12-17"
  if (seats.includes("-")) {
    const [start, end] = seats.split("-").map((s) => parseInt(s.trim(), 10));
    if (!isNaN(start) && !isNaN(end)) {
      return { startSeat: start, endSeat: end };
    }
  }

  // Handle comma-separated format: "5,6,7"
  if (seats.includes(",")) {
    const seatNums = seats
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    if (seatNums.length > 0) {
      return { startSeat: seatNums[0], endSeat: seatNums[seatNums.length - 1] };
    }
  }

  // Handle single seat: "12"
  const singleSeat = parseInt(seats.trim(), 10);
  if (!isNaN(singleSeat)) {
    return { startSeat: singleSeat, endSeat: singleSeat + quantity - 1 };
  }

  // Fallback
  return { startSeat: 1, endSeat: quantity };
}

// =============================================================================
// Event Matching
// =============================================================================

/**
 * Extract a clean venue name from full venue string
 * e.g., "Soldier Field, Chicago, IL" -> "Soldier Field"
 * e.g., "SoFi Stadium, Inglewood, CA" -> "SoFi Stadium"
 */
function extractVenueName(venue: string): string {
  if (!venue) return "";
  
  // Split by comma and take the first part (venue name)
  const parts = venue.split(",");
  const venueName = parts[0].trim();
  
  // Return the full venue name (e.g., "Soldier Field" not just "soldier")
  return venueName;
}

/**
 * Extract search terms from event name when artistName is not available
 * Strategy: Take first 2-3 meaningful words, skip common tour words
 */
function extractSearchTermFromEventName(eventName: string): string {
  if (!eventName) return "";
  
  // Common words to skip in tour names
  const skipWords = new Set([
    "the", "tour", "world", "live", "concert", "presents", "featuring",
    "in", "at", "with", "and", "of", "a", "an", "for"
  ]);
  
  // First, try splitting by common delimiters
  // "Bruno Mars - The Romantic Tour" -> "Bruno Mars"
  // "BTS WORLD TOUR 'ARIRANG'" -> need to extract "BTS"
  const delimiterMatch = eventName.split(/\s*[-–—:]\s*/)[0].trim();
  
  // Get meaningful words from the result
  const words = delimiterMatch
    .replace(/['"]/g, "") // Remove quotes
    .split(/\s+/)
    .filter(w => w.length > 1 && !skipWords.has(w.toLowerCase()));
  
  // Return first 2-3 words (enough to identify artist)
  return words.slice(0, 3).join(" ");
}

/**
 * Find matching TicketVault event for a dashboard event
 * 
 * @param artistName - Artist/performer name (preferred for search)
 * @param eventName - Full event/tour name (fallback if artistName empty)
 * @param venue - Full venue string (e.g., "Soldier Field, Chicago, IL")
 * @param eventDate - Event date
 */
export async function findMatchingPosEvent(
  artistName: string | null | undefined,
  eventName: string,
  venue: string,
  eventDate: Date
): Promise<TicketVaultEvent | null> {
  try {
    // Determine search name: prioritize artistName, fallback to extracting from eventName
    let searchName: string;
    
    if (artistName && artistName.trim()) {
      // Use artist name directly (e.g., "BTS", "Bruno Mars")
      searchName = artistName.trim();
      console.log(`[POS Sync] Using artistName for search: "${searchName}"`);
    } else {
      // Extract from event name
      searchName = extractSearchTermFromEventName(eventName);
      console.log(`[POS Sync] Extracted search term from eventName: "${searchName}" (from "${eventName}")`);
    }
    
    if (!searchName) {
      console.warn(`[POS Sync] Could not determine search name from artistName="${artistName}" or eventName="${eventName}"`);
      return null;
    }

    // Extract clean venue name (before the comma with city/state)
    const searchVenue = extractVenueName(venue);
    console.log(`[POS Sync] Searching for: "${searchName}" at "${searchVenue}" on ${eventDate.toISOString().split('T')[0]}`);

    const events = await TicketVaultApi.searchEvents(
      searchName,
      eventDate,
      searchVenue
    );

    if (events.length === 0) {
      // Try a more lenient search with just the first word of venue
      const venueFirstWord = searchVenue.split(/\s+/)[0] || "";
      console.log(`[POS Sync] No events found, trying with venue first word: "${venueFirstWord}"`);
      
      let retryEvents = await TicketVaultApi.searchEvents(
        searchName,
        eventDate,
        venueFirstWord
      );
      
      // If still no results, try with empty venue (search by name and date only)
      if (retryEvents.length === 0 && venueFirstWord) {
        console.log(`[POS Sync] No events found, trying without venue filter...`);
        retryEvents = await TicketVaultApi.searchEvents(
          searchName,
          eventDate,
          ""
        );
      }
      
      if (retryEvents.length === 0) {
        console.warn(`[POS Sync] No events found for "${searchName}" at "${searchVenue}" on ${eventDate.toISOString().split('T')[0]}`);
        return null;
      }
      
      // Use retry results
      if (retryEvents.length === 1) {
        console.log(`[POS Sync] Found 1 event on retry: ${retryEvents[0].PrimaryEvent} at ${retryEvents[0].Venue}`);
        return retryEvents[0];
      }
      
      // Multiple events on retry - try to match by venue
      const venueMatch = retryEvents.find(
        (e) =>
          e.Venue.toLowerCase().includes(searchVenue.toLowerCase()) ||
          searchVenue.toLowerCase().includes(e.Venue.toLowerCase().split(",")[0])
      );
      
      if (venueMatch) {
        console.log(`[POS Sync] Matched event by venue: ${venueMatch.PrimaryEvent} at ${venueMatch.Venue}`);
        return venueMatch;
      }
      
      console.warn(`[POS Sync] Multiple events found (${retryEvents.length}) on retry but no clear match`);
      return null;
    }

    // If exactly one event, return it
    if (events.length === 1) {
      console.log(`[POS Sync] Found 1 event: ${events[0].PrimaryEvent} at ${events[0].Venue}`);
      return events[0];
    }

    // Multiple events found - try to match by venue more precisely
    const venueMatch = events.find(
      (e) =>
        e.Venue.toLowerCase().includes(searchVenue.toLowerCase()) ||
        searchVenue.toLowerCase().includes(e.Venue.toLowerCase().split(",")[0])
    );

    if (venueMatch) {
      console.log(`[POS Sync] Matched event by venue from ${events.length} results: ${venueMatch.PrimaryEvent} at ${venueMatch.Venue}`);
      return venueMatch;
    }

    // If we can't find a clear match with multiple events, return the first one
    // (they're all on the same date, so likely correct)
    console.log(`[POS Sync] Multiple events found (${events.length}), returning first match: ${events[0].PrimaryEvent}`);
    return events[0];
  } catch (error) {
    console.error("[POS Sync] Event search failed:", error);
    return null;
  }
}

// =============================================================================
// Sync Functions
// =============================================================================

/**
 * Options for syncing a purchase to POS
 */
export interface SyncPurchaseOptions {
  splitType?: SplitType;
  listingPrice?: number;
}

/**
 * Sync a single purchase to TicketVault POS
 */
export async function syncPurchaseToPOS(
  purchaseId: string,
  options?: SyncPurchaseOptions
): Promise<SyncResult> {
  // Fetch purchase with event and account data
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      event: true,
      account: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!purchase) {
    return {
      purchaseId,
      dashboardPoNumber: "",
      success: false,
      error: "Purchase not found",
    };
  }

  // Check if already synced
  if (purchase.posSyncedAt) {
    return {
      purchaseId,
      dashboardPoNumber: purchase.dashboardPoNumber || "",
      success: true,
      posTicketGroupId: purchase.posTicketGroupId || undefined,
      posPurchaseOrderId: purchase.posPurchaseOrderId || undefined,
      posEventId: purchase.posEventId || undefined,
    };
  }

  // Validate required data
  if (!purchase.event) {
    return {
      purchaseId,
      dashboardPoNumber: purchase.dashboardPoNumber || "",
      success: false,
      error: "Purchase has no associated event",
    };
  }

  // Use eventDateRaw if available (preserves local date), fallback to eventDate
  // eventDateRaw is a string like "October 7, 2026 at 7:00 PM"
  let eventDateForSearch: Date | null = null;
  
  if (purchase.event.eventDateRaw) {
    // Parse "October 7, 2026 at 7:00 PM" or similar formats
    // Extract just the date portion before " at "
    const rawDate = purchase.event.eventDateRaw;
    const dateOnly = rawDate.split(" at ")[0]; // "October 7, 2026"
    
    // Always use manual parsing to ensure UTC and avoid timezone issues
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };
    
    // Match "October 7, 2026", "October 07, 2026", "Oct 7, 2026", etc.
    const match = dateOnly.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (match) {
      const monthName = match[1].toLowerCase();
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      const month = months[monthName];
      if (month !== undefined) {
        // Create date at noon UTC to avoid timezone shifting
        eventDateForSearch = new Date(Date.UTC(year, month, day, 12, 0, 0));
        console.log(`[POS Sync] Parsed date "${dateOnly}" -> ${eventDateForSearch.toISOString()}`);
      }
    }
    
    // Fallback to Date constructor if manual parsing failed
    if (!eventDateForSearch) {
      const parsed = new Date(dateOnly);
      if (!isNaN(parsed.getTime())) {
        // Convert to UTC noon to avoid timezone issues
        eventDateForSearch = new Date(Date.UTC(
          parsed.getFullYear(),
          parsed.getMonth(),
          parsed.getDate(),
          12, 0, 0
        ));
        console.log(`[POS Sync] Fallback parsed date "${dateOnly}" -> ${eventDateForSearch.toISOString()}`);
      }
    }
  }
  
  if (!eventDateForSearch && purchase.event.eventDate) {
    eventDateForSearch = purchase.event.eventDate;
  }

  if (!eventDateForSearch) {
    return {
      purchaseId,
      dashboardPoNumber: purchase.dashboardPoNumber || "",
      success: false,
      error: "Event has no date",
    };
  }

  if (!purchase.section) {
    return {
      purchaseId,
      dashboardPoNumber: purchase.dashboardPoNumber || "",
      success: false,
      error: "Purchase has no section",
    };
  }

  // Assign PO number if needed
  const poNumber = await assignPoNumber(purchaseId);

  // Find matching event in POS
  // Use artistName for search (more reliable than full tour name)
  const posEvent = await findMatchingPosEvent(
    purchase.event.artistName,  // Primary search term (e.g., "BTS", "Bruno Mars")
    purchase.event.eventName,   // Fallback if artistName empty
    purchase.event.venue || "",
    eventDateForSearch
  );

  if (!posEvent) {
    return {
      purchaseId,
      dashboardPoNumber: poNumber,
      success: false,
      error: `Could not find matching event in POS for "${purchase.event.eventName}"`,
    };
  }

  // Parse seats
  const { startSeat, endSeat } = parseSeats(
    purchase.seats,
    purchase.quantity
  );

  // Calculate costs
  // totalPrice is the actual cost with fees - this is what we paid
  // priceEach is price without fees - only use as fallback
  const priceEachWithoutFees = purchase.priceEach ? Number(purchase.priceEach) : 0;
  const totalPrice = purchase.totalPrice
    ? Number(purchase.totalPrice)
    : priceEachWithoutFees * purchase.quantity;
  
  // Cost per ticket should be calculated from total (includes fees)
  const costPerTicket = totalPrice / purchase.quantity;

  try {
    // Use artist name for search (same as what found the event successfully)
    // Fallback to first part of event name if artist name is empty
    const searchEventName = purchase.event.artistName?.trim() || 
      purchase.event.eventName.split(/[-–—:]/)[0].trim();
    
    // Extract venue name before city/state (e.g., "United Center" from "United Center, Chicago, IL")
    const searchVenueName = (purchase.event.venue || "").split(",")[0].trim();
    
    // Save tickets to POS
    const result: TicketVaultSaveTicketsResponse =
      await TicketVaultApi.saveTickets(
        posEvent.Id,
        purchase.event.eventName,
        purchase.event.venue || "",
        eventDateForSearch,
        [
          {
            section: purchase.section,
            row: purchase.row || "GA",
            quantity: purchase.quantity,
            startSeat,
            endSeat,
            costPerTicket,  // Use cost per ticket from total (includes fees)
            totalCost: totalPrice,
            externalListingId: poNumber,
            accountEmail: purchase.account?.email || "",
            splitType: options?.splitType, // Pass split type if provided (defaults to Pairs in API)
            listingPrice: options?.listingPrice, // Pass listing price if provided (defaults to 9999)
          },
        ],
        searchEventName,  // Pass artist name for SearchRequest
        searchVenueName   // Pass clean venue name for SearchRequest
      );

    if (!result.Success) {
      // Check for duplicates - if already in POS, mark as synced
      const hasDuplicates = result.DuplicatedTickets && Array.isArray(result.DuplicatedTickets) && result.DuplicatedTickets.length > 0;
      
      if (hasDuplicates) {
        // Try to find the existing ticket group in POS by our external PO number
        try {
          const existing = await TicketVaultApi.findTicketGroupByExtPONumber(poNumber);
          if (existing) {
            // Mark as synced since it already exists
            await prisma.purchase.update({
              where: { id: purchaseId },
              data: {
                posSyncedAt: new Date(),
                posTicketGroupId: parseInt(existing.ticketGroup.Id, 10),
                posPurchaseOrderId: existing.purchaseOrder.Id,
                posEventId: existing.ticketGroup.ProductionId,
              },
            });
            
            return {
              purchaseId,
              dashboardPoNumber: poNumber,
              success: true,
              posTicketGroupId: parseInt(existing.ticketGroup.Id, 10),
              posPurchaseOrderId: existing.purchaseOrder.Id,
              posEventId: existing.ticketGroup.ProductionId,
              error: "Already in POS - marked as synced",
            };
          }
        } catch (lookupError) {
          console.warn("[POS Sync] Could not verify duplicate in POS:", lookupError);
        }
      }
      
      // Build detailed error message from POS response
      const errorParts: string[] = [];
      
      // Check for specific failure reasons
      if (result.FailedEvents && Array.isArray(result.FailedEvents) && result.FailedEvents.length > 0) {
        // Parse the event failure reason
        const failedEvents = result.FailedEvents as Array<{ EventId?: number; Reason?: string }>;
        const eventErrors = failedEvents.map((fe) => {
          if (fe.Reason?.includes("Could not find")) {
            return `Event not found in POS - ensure the event is mapped first`;
          }
          return fe.Reason || "Unknown event error";
        });
        errorParts.push(...eventErrors);
      }
      
      if (result.FailedTickets && Array.isArray(result.FailedTickets) && result.FailedTickets.length > 0) {
        errorParts.push(`Failed tickets: ${result.FailedTickets.length}`);
      }
      
      if (hasDuplicates) {
        errorParts.push(`Duplicate PO# detected - already in POS but could not verify`);
      }
      
      const errorDetail = errorParts.length > 0 ? errorParts.join("; ") : "Unknown POS error";
      
      console.error("[POS Sync] SaveTickets failed:", {
        purchaseId,
        eventId: posEvent.Id,
        failedEvents: result.FailedEvents,
        failedTickets: result.FailedTickets,
        duplicates: result.DuplicatedTickets,
      });
      
      return {
        purchaseId,
        dashboardPoNumber: poNumber,
        success: false,
        error: errorDetail,
      };
    }

    // Update purchase with POS IDs
    await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        posSyncedAt: new Date(),
        posTicketGroupId: result.SavedPoTGIDs[0] || null,
        posPurchaseOrderId: result.PurchaseOrderID,
        posEventId: posEvent.Id,
      },
    });

    return {
      purchaseId,
      dashboardPoNumber: poNumber,
      success: true,
      posTicketGroupId: result.SavedPoTGIDs[0],
      posPurchaseOrderId: result.PurchaseOrderID,
      posEventId: posEvent.Id,
    };
  } catch (error) {
    return {
      purchaseId,
      dashboardPoNumber: poNumber,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Options for batch syncing purchases with per-purchase settings
 */
export interface PurchaseSyncItem {
  purchaseId: string;
  splitType?: SplitType;
  listingPrice?: number;
}

/**
 * Sync multiple purchases to TicketVault POS
 * Accepts either simple purchase IDs or detailed options per purchase
 */
export async function syncPurchasesToPOS(
  purchaseItems: string[] | PurchaseSyncItem[]
): Promise<BatchSyncResult> {
  const results: SyncResult[] = [];

  for (const item of purchaseItems) {
    // Handle both simple string IDs and detailed options
    if (typeof item === "string") {
      const result = await syncPurchaseToPOS(item);
      results.push(result);
    } else {
      const result = await syncPurchaseToPOS(item.purchaseId, {
        splitType: item.splitType,
        listingPrice: item.listingPrice,
      });
      results.push(result);
    }
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    totalProcessed: results.length,
    successful,
    failed,
    results,
  };
}

/**
 * Get purchases that are ready to sync (have events, not already synced)
 */
export async function getPurchasesReadyForSync(): Promise<
  { id: string; eventName: string; section: string | null; quantity: number }[]
> {
  const purchases = await prisma.purchase.findMany({
    where: {
      status: "SUCCESS",
      posSyncedAt: null,
      event: {
        isNot: null,
      },
    },
    select: {
      id: true,
      section: true,
      quantity: true,
      event: {
        select: {
          eventName: true,
        },
      },
    },
  });

  return purchases.map((p) => ({
    id: p.id,
    eventName: p.event?.eventName || "Unknown",
    section: p.section,
    quantity: p.quantity,
  }));
}

/**
 * Assign PO numbers to ALL successful purchases that don't have one yet
 * This is useful for bulk-assigning PO numbers without syncing to POS
 */
export async function assignPoNumbersToAllPurchases(): Promise<{
  assigned: number;
  alreadyHad: number;
  total: number;
}> {
  // Get all successful purchases without PO numbers
  const purchases = await prisma.purchase.findMany({
    where: {
      status: "SUCCESS",
      dashboardPoNumber: null,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc", // Assign in order of creation
    },
  });

  let assigned = 0;

  for (const purchase of purchases) {
    await assignPoNumber(purchase.id);
    assigned++;
  }

  // Count how many already had PO numbers
  const withPoNumbers = await prisma.purchase.count({
    where: {
      status: "SUCCESS",
      dashboardPoNumber: { not: null },
    },
  });

  return {
    assigned,
    alreadyHad: withPoNumbers - assigned,
    total: purchases.length + (withPoNumbers - assigned),
  };
}

// =============================================================================
// POS Read Functions (Fetching data from TicketVault)
// =============================================================================

/**
 * Fetch all purchase orders from TicketVault POS
 */
export async function fetchPosOrders(options?: {
  extPONumber?: string;
  accountEmail?: string;
  eventStartDate?: Date;
  skip?: number;
  take?: number;
}): Promise<TicketVaultPurchaseOrder[]> {
  return TicketVaultApi.getPurchaseOrders(options);
}

/**
 * Verify a synced purchase exists in POS and get its current state
 */
export async function verifyPurchaseInPos(purchaseId: string): Promise<{
  exists: boolean;
  dashboardPoNumber: string | null;
  posData: TicketVaultPurchaseOrder | null;
  error?: string;
}> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      dashboardPoNumber: true,
      posPurchaseOrderId: true,
      posTicketGroupId: true,
    },
  });

  if (!purchase) {
    return {
      exists: false,
      dashboardPoNumber: null,
      posData: null,
      error: "Purchase not found in dashboard",
    };
  }

  if (!purchase.dashboardPoNumber) {
    return {
      exists: false,
      dashboardPoNumber: null,
      posData: null,
      error: "Purchase has no PO number",
    };
  }

  try {
    // Search by our external PO number
    const posOrder = await TicketVaultApi.getPurchaseOrderByExtPONumber(
      purchase.dashboardPoNumber
    );

    return {
      exists: !!posOrder,
      dashboardPoNumber: purchase.dashboardPoNumber,
      posData: posOrder,
    };
  } catch (error) {
    return {
      exists: false,
      dashboardPoNumber: purchase.dashboardPoNumber,
      posData: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get summary of POS sync status for dashboard
 */
export async function getPosSyncSummary(): Promise<{
  totalSuccessfulPurchases: number;
  withPoNumbers: number;
  syncedToPos: number;
  pendingSync: number;
}> {
  const [totalSuccessful, withPoNumbers, syncedToPos] = await Promise.all([
    prisma.purchase.count({ where: { status: "SUCCESS" } }),
    prisma.purchase.count({
      where: { status: "SUCCESS", dashboardPoNumber: { not: null } },
    }),
    prisma.purchase.count({
      where: { status: "SUCCESS", posSyncedAt: { not: null } },
    }),
  ]);

  return {
    totalSuccessfulPurchases: totalSuccessful,
    withPoNumbers,
    syncedToPos,
    pendingSync: withPoNumbers - syncedToPos,
  };
}

// =============================================================================
// Import from POS Functions
// =============================================================================

export interface PosTicketGroupForImport {
  ticketGroupId: string;
  section: string;
  row: string;
  quantity: number;
  startSeat: number;
  endSeat: number;
  costPerTicket: number;
  extPONumber: string | null;
  accountEmail: string | null;
  eventName: string;
  venueName: string;
  eventDateTime: string;
}

export interface PosImportCandidate {
  posOrderId: number;
  posCost: number;
  clientName: string;
  createdDate: string;
  createdBy: string;
  ticketGroups: PosTicketGroupForImport[];
  // Match info
  matchedPurchaseId?: string;
  matchConfidence?: "exact" | "high" | "medium" | "low" | "none";
  matchReason?: string;
}

/**
 * Get list of POs from TicketVault that might need to be imported
 * Includes full ticket group details for better matching
 */
export async function getPosOrdersForImport(): Promise<PosImportCandidate[]> {
  const orders = await TicketVaultApi.getPurchaseOrders({
    take: 100,
  });

  const candidates: PosImportCandidate[] = [];

  for (const order of orders) {
    try {
      // Fetch ticket groups for this PO
      const ticketGroups = await TicketVaultApi.getTicketGroupsForPO(order.Id);
      
      candidates.push({
        posOrderId: order.Id,
        posCost: order.TotalCost,
        clientName: order.ClientName,
        createdDate: "",
        createdBy: "",
        ticketGroups: ticketGroups.map((tg) => ({
          ticketGroupId: tg.Id,
          section: tg.Section,
          row: tg.Row,
          quantity: tg.Quantity,
          startSeat: tg.StartSeat,
          endSeat: tg.EndSeat,
          costPerTicket: tg.CostPerTicket,
          extPONumber: tg.ExtPONumber,
          accountEmail: tg.AccountEmail,
          eventName: tg.EventName,
          venueName: tg.VenueName,
          eventDateTime: tg.EventDateTime,
        })),
      });
    } catch (error) {
      console.warn(`[POS Import] Could not fetch ticket groups for PO ${order.Id}:`, error);
      candidates.push({
        posOrderId: order.Id,
        posCost: order.TotalCost,
        clientName: order.ClientName,
        createdDate: "",
        createdBy: "",
        ticketGroups: [],
      });
    }
  }

  return candidates;
}

/**
 * Try to match a POS order to an existing dashboard purchase
 * Based on: total cost, date created, and ticket details if available
 */
export async function matchPosOrderToPurchase(
  posOrderId: number,
  posCost: number,
  ticketGroupDetails?: {
    section: string;
    row: string;
    quantity: number;
    accountEmail: string | null;
  }
): Promise<{
  purchaseId: string | null;
  confidence: "exact" | "high" | "medium" | "low" | "none";
  reason: string;
}> {
  // If we have ticket group details with account email, try exact match
  if (ticketGroupDetails?.accountEmail) {
    const exactMatch = await prisma.purchase.findFirst({
      where: {
        status: "SUCCESS",
        posSyncedAt: null, // Not already synced
        totalPrice: posCost,
        section: ticketGroupDetails.section,
        row: ticketGroupDetails.row,
        quantity: ticketGroupDetails.quantity,
        account: {
          email: ticketGroupDetails.accountEmail,
        },
      },
      select: { id: true },
    });

    if (exactMatch) {
      return {
        purchaseId: exactMatch.id,
        confidence: "exact",
        reason: `Matched by email, section, row, quantity, and cost`,
      };
    }
  }

  // Try matching by section, row, quantity, and cost
  if (ticketGroupDetails) {
    const sectionMatch = await prisma.purchase.findFirst({
      where: {
        status: "SUCCESS",
        posSyncedAt: null,
        totalPrice: posCost,
        section: ticketGroupDetails.section,
        row: ticketGroupDetails.row,
        quantity: ticketGroupDetails.quantity,
      },
      select: { id: true },
    });

    if (sectionMatch) {
      return {
        purchaseId: sectionMatch.id,
        confidence: "high",
        reason: `Matched by section, row, quantity, and cost (no email verification)`,
      };
    }
  }

  // Try matching just by cost (low confidence)
  const costMatch = await prisma.purchase.findFirst({
    where: {
      status: "SUCCESS",
      posSyncedAt: null,
      totalPrice: posCost,
    },
    select: { id: true },
  });

  if (costMatch) {
    return {
      purchaseId: costMatch.id,
      confidence: "low",
      reason: `Matched only by total cost - verify manually`,
    };
  }

  return {
    purchaseId: null,
    confidence: "none",
    reason: `No matching purchase found`,
  };
}

/**
 * Link a POS order to a dashboard purchase (import from POS)
 */
export async function linkPosOrderToPurchase(
  purchaseId: string,
  posOrderId: number,
  posTicketGroupId?: number,
  posEventId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        posSyncedAt: new Date(),
        posPurchaseOrderId: posOrderId,
        posTicketGroupId: posTicketGroupId ?? null,
        posEventId: posEventId ?? null,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

export const PosSyncService = {
  getNextPoNumber,
  assignPoNumber,
  assignPoNumbersToAllPurchases,
  parseSeats,
  findMatchingPosEvent,
  syncPurchaseToPOS,
  syncPurchasesToPOS,
  getPurchasesReadyForSync,
  fetchPosOrders,
  verifyPurchaseInPos,
  getPosSyncSummary,
  // Import from POS
  getPosOrdersForImport,
  matchPosOrderToPurchase,
  linkPosOrderToPurchase,
};
