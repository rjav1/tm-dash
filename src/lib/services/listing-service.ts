/**
 * Listing Service
 * Manages POS listings cached in local database
 */

import prisma from "@/lib/db";
import { TicketStatus } from "@prisma/client";
import {
  TicketVaultApi,
  OperationsTicketGroup,
} from "./ticketvault-api";
import { EventMatcher } from "./event-matcher";
import { TicketService } from "./ticket-service";

// =============================================================================
// Types
// =============================================================================

export interface SyncResult {
  success: boolean;
  synced: number;
  created: number;
  updated: number;
  linked: number; // Linked to existing purchases
  error?: string;
}

export interface ListingsFilters {
  isMatched?: boolean;
  hasExtPO?: boolean; // true = only our tickets, false = all
  search?: string;
  eventName?: string;
  page?: number;
  limit?: number;
}

export interface ListingsResponse {
  listings: Array<{
    id: string;
    ticketGroupId: number;
    eventName: string;
    venueName: string | null;
    venueCity: string | null;
    eventDateTime: Date | null;
    section: string;
    row: string;
    startSeat: number;
    endSeat: number;
    quantity: number;
    cost: number;
    price: number;
    accountEmail: string | null;
    internalNote: string | null;
    extPONumber: string | null;
    isMatched: boolean;
    barcodesCount: number;
    pdfsCount: number;
    linksCount: number;
    pdfStatus: string | null;
    vividEventId: number | null;
    stubhubEventId: number | null;
    seatgeekEventId: number | null;
    tmEventId: string | null;
    lastSyncedAt: Date;
    purchaseId: string | null;
    // Account sync metadata from TicketVault
    accountLastCheckedAt: Date | null;
    accountSyncStatus: string | null;
  }>;
  stats: {
    total: number;
    matched: number;
    unmatched: number;
    ours: number; // With extPONumber
    totalValue: number;
    totalCost: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface MatchResult {
  success: boolean;
  accountEmail?: string;
  seasonSiteId?: number;
  processingStatus?: string;
  error?: string;
}

// =============================================================================
// Sync Functions
// =============================================================================

/**
 * Sync all listings from TicketVault POS to local database
 */
export async function syncListingsFromPos(): Promise<SyncResult> {
  try {
    console.log("[ListingService] Starting sync from POS...");

    // Fetch all listings from POS
    const { listings: posListings } = await TicketVaultApi.getAllOperationsInfo({
      take: 500,
    });

    if (posListings.length === 0) {
      return {
        success: true,
        synced: 0,
        created: 0,
        updated: 0,
        linked: 0,
      };
    }

    let created = 0;
    let updated = 0;
    let linked = 0;
    let ticketsLinked = 0;
    const now = new Date();

    // Get all purchases with PO numbers for linking
    const purchases = await prisma.purchase.findMany({
      where: { dashboardPoNumber: { not: null } },
      select: { id: true, dashboardPoNumber: true, eventId: true },
    });
    const purchaseMap = new Map(
      purchases.map((p) => [p.dashboardPoNumber, p])
    );

    // Upsert each listing
    for (const pos of posListings) {
      // Parse event date
      let eventDateTime: Date | null = null;
      if (pos.EventDateTime) {
        try {
          eventDateTime = new Date(pos.EventDateTime);
        } catch {
          // Ignore parse errors
        }
      }

      // Parse PDF status for pdfsCount
      const pdfMatch = pos.Pdf?.match(/^(\d+)\/(\d+)/);
      const pdfsCount = pdfMatch ? parseInt(pdfMatch[1], 10) : 0;

      // ExtPONumber comes from HtmlExtPOIDMultiLineTooltip in API response
      const extPONumber = pos.HtmlExtPOIDMultiLineTooltip || pos.HtmlExtPOIDEllipsis || null;
      
      // AccountEmail - use InternalNote as fallback if AccountEmail is empty
      // (Some tickets have email only in InternalNote)
      let accountEmail = pos.AccountEmail?.trim() || null;
      if (!accountEmail && pos.InternalNote) {
        // Try to extract email from internal note
        const emailMatch = pos.InternalNote.trim().match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          accountEmail = emailMatch[0];
        }
      }
      
      // Find linked purchase by ExtPONumber
      const purchaseData = extPONumber
        ? purchaseMap.get(extPONumber) || null
        : null;
      const purchaseId = purchaseData?.id || null;
      const purchaseEventId = purchaseData?.eventId || null;
      
      // Find or create Event for this listing
      let eventId: string | null = null;
      if (eventDateTime || pos.PrimaryEventName) {
        try {
          const eventResult = await EventMatcher.findOrCreateEvent({
            posProductionId: pos.ProductionID || undefined,
            eventName: pos.PrimaryEventName,
            venue: pos.VenueName,
            eventDate: eventDateTime || undefined,
          });
          eventId = eventResult.event?.id || null;
          
          // If we found an event via posProductionId but haven't set it yet, update it
          if (eventResult.event && pos.ProductionID && !eventResult.event.posProductionId) {
            await EventMatcher.updateEventWithPosData(eventResult.event.id, {
              posProductionId: pos.ProductionID,
            });
          }
        } catch (eventError) {
          console.warn(`[ListingService] Could not match/create event for ${pos.PrimaryEventName}:`, eventError);
        }
      }
      
      // Prefer purchase's eventId if available (more authoritative)
      if (purchaseEventId) {
        eventId = purchaseEventId;
      }

      // Check if listing exists
      const existing = await prisma.listing.findUnique({
        where: { ticketGroupId: pos.TicketGroupID },
      });

      if (existing) {
        // Update existing
        await prisma.listing.update({
          where: { ticketGroupId: pos.TicketGroupID },
          data: {
            eventName: pos.PrimaryEventName,
            venueName: pos.VenueName,
            venueCity: pos.VenueCity || null,
            eventDateTime,
            section: pos.Section,
            row: pos.Row,
            startSeat: pos.StartSeat,
            endSeat: pos.EndSeat,
            quantity: pos.Quantity,
            cost: pos.Cost,
            price: pos.MarketPrice, // Use MarketPrice for listing price (Price is always 0)
            accountEmail: accountEmail,
            internalNote: pos.InternalNote || null,
            extPONumber: extPONumber,
            isMatched: pos.IsFullyMapped,
            barcodesCount: pos.BarcodesCount,
            pdfsCount,
            linksCount: pos.LinksCount,
            pdfStatus: pos.Pdf,
            statusTypeId: pos.StatusTypeId,
            poVendor: pos.POVendor || null,
            vividEventId: pos.VividEventID || null,
            stubhubEventId: pos.StubhubEventID || null,
            seatgeekEventId: pos.SeatGeekEventID || null,
            tmEventId: pos.TMEventID || null,
            productionId: pos.ProductionID,
            purchaseOrderId: pos.PurchaseOrderID || null,
            lastSyncedAt: now,
            purchaseId,
            eventId,
          },
        });
        updated++;
        if (purchaseId && !existing.purchaseId) {
          linked++;
        }
        
        // Link tickets to this listing (if we have event and purchase)
        if (eventId && purchaseId) {
          const linkResult = await TicketService.linkTicketsToListing(
            existing.id,
            eventId,
            pos.Section,
            pos.Row,
            pos.StartSeat,
            pos.EndSeat
          );
          ticketsLinked += linkResult.linked;
        }
      } else {
        // Create new
        const newListing = await prisma.listing.create({
          data: {
            ticketGroupId: pos.TicketGroupID,
            purchaseOrderId: pos.PurchaseOrderID || null,
            eventName: pos.PrimaryEventName,
            venueName: pos.VenueName,
            venueCity: pos.VenueCity || null,
            eventDateTime,
            section: pos.Section,
            row: pos.Row,
            startSeat: pos.StartSeat,
            endSeat: pos.EndSeat,
            quantity: pos.Quantity,
            cost: pos.Cost,
            price: pos.MarketPrice, // Use MarketPrice for listing price (Price is always 0)
            accountEmail: accountEmail,
            internalNote: pos.InternalNote || null,
            extPONumber: extPONumber,
            isMatched: pos.IsFullyMapped,
            barcodesCount: pos.BarcodesCount,
            pdfsCount,
            linksCount: pos.LinksCount,
            pdfStatus: pos.Pdf,
            statusTypeId: pos.StatusTypeId,
            poVendor: pos.POVendor || null,
            vividEventId: pos.VividEventID || null,
            stubhubEventId: pos.StubhubEventID || null,
            seatgeekEventId: pos.SeatGeekEventID || null,
            tmEventId: pos.TMEventID || null,
            productionId: pos.ProductionID,
            lastSyncedAt: now,
            purchaseId,
            eventId,
          },
        });
        created++;
        if (purchaseId) {
          linked++;
        }
        
        // Link tickets to this new listing (if we have event and purchase)
        if (eventId && purchaseId) {
          const linkResult = await TicketService.linkTicketsToListing(
            newListing.id,
            eventId,
            pos.Section,
            pos.Row,
            pos.StartSeat,
            pos.EndSeat
          );
          ticketsLinked += linkResult.linked;
        }
      }
    }

    console.log(
      `[ListingService] Sync complete: ${created} created, ${updated} updated, ${linked} purchases linked, ${ticketsLinked} tickets linked`
    );

    // Also sync account metadata (posLastCheckedAt, etc.) from TicketVault
    try {
      const accountSyncResult = await syncAccountMetadataFromPos();
      console.log(`[ListingService] Account metadata sync: ${accountSyncResult.updated} accounts updated`);
    } catch (accountError) {
      console.error("[ListingService] Account metadata sync error (non-fatal):", accountError);
    }

    return {
      success: true,
      synced: posListings.length,
      created,
      updated,
      linked,
    };
  } catch (error) {
    console.error("[ListingService] Sync error:", error);
    return {
      success: false,
      synced: 0,
      created: 0,
      updated: 0,
      linked: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get listings from local database with filtering
 */
export async function getListings(
  filters: ListingsFilters
): Promise<ListingsResponse> {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (filters.isMatched !== undefined) {
    where.isMatched = filters.isMatched;
  }

  if (filters.hasExtPO === true) {
    where.extPONumber = { not: null };
  } else if (filters.hasExtPO === false) {
    // Show all (no filter)
  }

  if (filters.eventName) {
    where.eventName = { contains: filters.eventName, mode: "insensitive" };
  }

  if (filters.search) {
    where.OR = [
      { section: { contains: filters.search, mode: "insensitive" } },
      { row: { contains: filters.search, mode: "insensitive" } },
      { accountEmail: { contains: filters.search, mode: "insensitive" } },
      { extPONumber: { contains: filters.search, mode: "insensitive" } },
      { eventName: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  // Get listings
  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      skip,
      take: limit,
      orderBy: { eventDateTime: "asc" },
    }),
    prisma.listing.count({ where }),
  ]);

  // Get stats
  const [matchedCount, unmatchedCount, oursCount, valueAgg] =
    await Promise.all([
      prisma.listing.count({ where: { ...where, isMatched: true } }),
      prisma.listing.count({ where: { ...where, isMatched: false } }),
      prisma.listing.count({ where: { ...where, extPONumber: { not: null } } }),
      prisma.listing.aggregate({
        where,
        _sum: { price: true },
      }),
    ]);

  // Calculate actual total cost as SUM(cost * quantity) - need raw SQL since Prisma doesn't support computed aggregates
  // For "our tickets" only (those with extPONumber), calculate the actual total cost
  const totalCostResult = await prisma.$queryRaw<[{ total: number | null }]>`
    SELECT SUM(cost * quantity) as total
    FROM "listings"
    WHERE "ext_po_number" IS NOT NULL
  `;
  const totalCost = Number(totalCostResult[0]?.total || 0);

  // Batch lookup account sync metadata for all unique emails in listings
  const uniqueEmails = [...new Set(listings.map(l => l.accountEmail).filter(Boolean))] as string[];
  const accountsData = uniqueEmails.length > 0 
    ? await prisma.account.findMany({
        where: { email: { in: uniqueEmails, mode: "insensitive" } },
        select: { 
          email: true, 
          posLastCheckedAt: true, 
          posSyncStatus: true 
        },
      })
    : [];
  
  // Create lookup map by lowercase email
  const accountMap = new Map(
    accountsData.map(a => [a.email.toLowerCase(), a])
  );

  return {
    listings: listings.map((l) => {
      // Look up account sync data
      const accountData = l.accountEmail 
        ? accountMap.get(l.accountEmail.toLowerCase()) 
        : null;
      
      return {
        id: l.id,
        ticketGroupId: l.ticketGroupId,
        eventName: l.eventName,
        venueName: l.venueName,
        venueCity: l.venueCity,
        eventDateTime: l.eventDateTime,
        section: l.section,
        row: l.row,
        startSeat: l.startSeat,
        endSeat: l.endSeat,
        quantity: l.quantity,
        cost: Number(l.cost),
        price: Number(l.price),
        accountEmail: l.accountEmail,
        internalNote: l.internalNote,
        extPONumber: l.extPONumber,
        isMatched: l.isMatched,
        barcodesCount: l.barcodesCount,
        pdfsCount: l.pdfsCount,
        linksCount: l.linksCount,
        pdfStatus: l.pdfStatus,
        vividEventId: l.vividEventId,
        stubhubEventId: l.stubhubEventId,
        seatgeekEventId: l.seatgeekEventId,
        tmEventId: l.tmEventId,
        lastSyncedAt: l.lastSyncedAt,
        purchaseId: l.purchaseId,
        accountLastCheckedAt: accountData?.posLastCheckedAt || null,
        accountSyncStatus: accountData?.posSyncStatus || null,
      };
    }),
    stats: {
      total,
      matched: matchedCount,
      unmatched: unmatchedCount,
      ours: oursCount,
      totalValue: Number(valueAgg._sum.price || 0),
      totalCost,
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get unique event names for filter dropdown
 */
export async function getListingEvents(): Promise<string[]> {
  const events = await prisma.listing.findMany({
    select: { eventName: true },
    distinct: ["eventName"],
    orderBy: { eventName: "asc" },
  });
  return events.map((e) => e.eventName);
}

// =============================================================================
// Update Functions
// =============================================================================

/**
 * Update listing price in TicketVault POS and local cache
 * Uses the /api/ticketGroup/price endpoint for direct price updates
 */
export async function updateListingPrice(
  listingId: string,
  newPrice: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the listing with production ID
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      return { success: false, error: "Listing not found" };
    }

    // Update price in TicketVault POS
    await TicketVaultApi.updateListingPrice(
      listing.ticketGroupId,
      newPrice,
      listing.productionId || undefined
    );

    // Update local cache
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        price: newPrice,
        lastSyncedAt: new Date(),
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
// Match Functions
// =============================================================================

/**
 * Trigger match/sync for a listing
 * Finds the account email and triggers account sync
 */
export async function triggerMatch(listingId: string): Promise<MatchResult> {
  try {
    // Get the listing
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      return { success: false, error: "Listing not found" };
    }

    if (!listing.accountEmail) {
      return { success: false, error: "No account email for this listing" };
    }

    // Check if account is set up as a Season Site (required for ticket sync)
    let site = await TicketVaultApi.findSeasonSiteByEmail(listing.accountEmail);
    
    if (!site) {
      // Check if it's at least a Purchase Account
      const purchaseAccount = await TicketVaultApi.findPurchaseAccountByEmail(listing.accountEmail);
      
      if (purchaseAccount) {
        // Try to automatically add as Season Site
        console.log(`[Match] Account ${listing.accountEmail} is Purchase Account but not Season Site, adding...`);
        const addResult = await TicketVaultApi.addSeasonSite([purchaseAccount.PurchaseAccountId]);
        
        if (addResult.success && addResult.seasonSites?.length) {
          console.log(`[Match] Successfully added ${listing.accountEmail} as Season Site`);
          // Refetch the season site
          site = await TicketVaultApi.findSeasonSiteByEmail(listing.accountEmail);
        } else {
          return {
            success: false,
            error: `Failed to add account as Season Site: ${addResult.error || 'Unknown error'}`,
          };
        }
      } else {
        return {
          success: false,
          error: `Account not found in POS: ${listing.accountEmail}`,
        };
      }
    }
    
    if (!site) {
      return {
        success: false,
        error: `Account not connected in POS: ${listing.accountEmail}`,
      };
    }

    // Trigger sync
    const result = await TicketVaultApi.syncAccountByEmail(listing.accountEmail);

    if (!result.success) {
      return {
        success: false,
        accountEmail: listing.accountEmail,
        error: result.error,
      };
    }

    return {
      success: true,
      accountEmail: listing.accountEmail,
      seasonSiteId: result.seasonSiteId,
      processingStatus: site.ProcessingStatus || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get account sync status for a listing
 */
export async function getAccountSyncStatus(
  listingId: string
): Promise<{
  email: string | null;
  isConnected: boolean;
  processingStatus: string | null;
  lastError: string | null;
}> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing?.accountEmail) {
    return {
      email: null,
      isConnected: false,
      processingStatus: null,
      lastError: null,
    };
  }

  const site = await TicketVaultApi.findSeasonSiteByEmail(listing.accountEmail);

  return {
    email: listing.accountEmail,
    isConnected: !!site,
    processingStatus: site?.ProcessingStatus || null,
    lastError: site?.LastError || null,
  };
}

// =============================================================================
// Account Sync Metadata
// =============================================================================

/**
 * Sync account metadata from TicketVault (season sites).
 * Updates posLastCheckedAt, posSyncStatus, etc. for all accounts found in TV.
 * This should be called periodically or after syncing listings.
 */
export async function syncAccountMetadataFromPos(): Promise<{
  success: boolean;
  updated: number;
  error?: string;
}> {
  try {
    console.log("[AccountSync] Fetching season sites from TicketVault...");
    const seasonSites = await TicketVaultApi.getSeasonSitesList();
    console.log(`[AccountSync] Found ${seasonSites.length} season sites`);

    let updated = 0;

    for (const site of seasonSites) {
      if (!site.UserName || site.IsDeleted) continue;

      const email = site.UserName.toLowerCase().trim();
      
      // Parse the LastCheckedDateTimeUTC
      let lastCheckedAt: Date | null = null;
      if (site.LastCheckedDateTimeUTC) {
        lastCheckedAt = new Date(site.LastCheckedDateTimeUTC);
      }

      // Try to update the account if it exists
      const result = await prisma.account.updateMany({
        where: { email: { equals: email, mode: "insensitive" } },
        data: {
          posSeasonSiteId: site.CompanySeasonSiteID,
          posLastCheckedAt: lastCheckedAt,
          posSyncStatus: site.ProcessingStatus || "Unknown",
          posLastError: site.LastError,
          posTicketsFound: site.TotalCountForPaginator || 0,
          posTicketsUpdated: site.TotalUpdatedAfterLastSync || 0,
        },
      });

      if (result.count > 0) {
        updated += result.count;
      }
    }

    console.log(`[AccountSync] Updated ${updated} accounts with POS metadata`);
    return { success: true, updated };
  } catch (error) {
    console.error("[AccountSync] Error syncing account metadata:", error);
    return { success: false, updated: 0, error: String(error) };
  }
}

/**
 * Get account sync info by email.
 * Returns the cached POS metadata from our database.
 */
export async function getAccountPosInfo(email: string): Promise<{
  posLastCheckedAt: Date | null;
  posSyncStatus: string | null;
  posLastError: string | null;
  posTicketsFound: number | null;
} | null> {
  const account = await prisma.account.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: {
      posLastCheckedAt: true,
      posSyncStatus: true,
      posLastError: true,
      posTicketsFound: true,
    },
  });
  return account;
}

// =============================================================================
// Exports
// =============================================================================

export const ListingService = {
  syncListingsFromPos,
  syncAccountMetadataFromPos,
  getListings,
  getListingEvents,
  updateListingPrice,
  triggerMatch,
  getAccountSyncStatus,
  getAccountPosInfo,
};
