import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";
import { mapSectionToZone } from "@/lib/utils/section-mapper";
import { assignPoNumber } from "@/lib/services/pos-sync";

// Zone price type from database
interface ZonePriceRecord {
  zone_name: string;
  min_price: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const eventId = searchParams.get("eventId") || "";
    const search = searchParams.get("search") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;
    
    // New filter parameters
    const section = searchParams.get("section") || "";
    const row = searchParams.get("row") || "";
    const poNumber = searchParams.get("poNumber") || "";
    const posSync = searchParams.get("posSync") || ""; // "synced", "not_synced", or ""
    const accountId = searchParams.get("accountId") || "";
    const cardId = searchParams.get("cardId") || "";
    const minPrice = searchParams.get("minPrice") || "";
    const maxPrice = searchParams.get("maxPrice") || "";
    const hasCard = searchParams.get("hasCard") || ""; // "yes", "no", or ""
    const minQuantity = searchParams.get("minQuantity") || "";
    const maxQuantity = searchParams.get("maxQuantity") || "";
    const orderNumber = searchParams.get("orderNumber") || "";
    const seats = searchParams.get("seats") || "";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status && Object.values(PurchaseStatus).includes(status as PurchaseStatus)) {
      where.status = status as PurchaseStatus;
    }

    if (eventId) {
      where.eventId = eventId;
    }

    if (search) {
      where.account = {
        email: { contains: search, mode: "insensitive" },
      };
    }
    
    // Section filter (partial match)
    if (section) {
      where.section = { contains: section, mode: "insensitive" };
    }
    
    // Row filter (partial match)
    if (row) {
      where.row = { contains: row, mode: "insensitive" };
    }
    
    // PO Number filter (exact or partial match)
    if (poNumber) {
      where.dashboardPoNumber = { contains: poNumber };
    }
    
    // Order number filter (TM order number)
    if (orderNumber) {
      where.orderNumber = { contains: orderNumber, mode: "insensitive" };
    }
    
    // Seats filter (partial match)
    if (seats) {
      where.seats = { contains: seats, mode: "insensitive" };
    }
    
    // POS Sync status filter
    if (posSync === "synced") {
      where.posSyncedAt = { not: null };
    } else if (posSync === "not_synced") {
      where.posSyncedAt = null;
    }
    
    // Account filter (specific account)
    if (accountId) {
      where.accountId = accountId;
    }
    
    // Card filter (specific card or has/doesn't have card)
    if (cardId) {
      where.cardId = cardId;
    } else if (hasCard === "yes") {
      where.cardId = { not: null };
    } else if (hasCard === "no") {
      where.cardId = null;
    }
    
    // Price range filter (total price)
    if (minPrice || maxPrice) {
      where.totalPrice = {};
      if (minPrice) {
        (where.totalPrice as Record<string, number>).gte = parseFloat(minPrice);
      }
      if (maxPrice) {
        (where.totalPrice as Record<string, number>).lte = parseFloat(maxPrice);
      }
    }
    
    // Quantity range filter
    if (minQuantity || maxQuantity) {
      where.quantity = {};
      if (minQuantity) {
        (where.quantity as Record<string, number>).gte = parseInt(minQuantity, 10);
      }
      if (maxQuantity) {
        (where.quantity as Record<string, number>).lte = parseInt(maxQuantity, 10);
      }
    }

    // Date range filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        // End date should be end of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, Date>).lte = endDateTime;
      }
    }

    // Get purchases with related data
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          account: {
            select: {
              id: true,
              email: true,
            },
          },
          event: {
            select: {
              id: true,
              tmEventId: true,
              eventName: true,
              eventDateRaw: true,
              venue: true,
              venueId: true,
            },
          },
          card: {
            select: {
              id: true,
              cardNumber: true,
              cardType: true,
            },
          },
        },
      }),
      prisma.purchase.count({ where }),
    ]);

    // Get events for filter
    const events = await prisma.event.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        eventName: true,
        artistName: true,
        eventDateRaw: true,
        venue: true,
        _count: {
          select: { purchases: true },
        },
      },
    });
    
    // Get accounts with purchases for filter dropdown
    const accountsWithPurchases = await prisma.account.findMany({
      where: {
        purchases: { some: {} },
      },
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        _count: {
          select: { purchases: true },
        },
      },
      take: 200, // Limit to 200 accounts for performance
    });
    
    // Get cards for filter dropdown
    const cardsForFilter = await prisma.card.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        cardType: true,
        cardNumber: true,
        _count: {
          select: { purchases: true },
        },
      },
      take: 100, // Limit to 100 cards
    });

    // Calculate overall stats (counts are already global, not paginated)
    const [successCount, failedCount, revenueResult, ticketSumResult] = await Promise.all([
      prisma.purchase.count({ where: { ...where, status: PurchaseStatus.SUCCESS } }),
      prisma.purchase.count({ where: { ...where, status: PurchaseStatus.FAILED } }),
      prisma.purchase.aggregate({
        where: { ...where, status: PurchaseStatus.SUCCESS },
        _sum: { totalPrice: true },
      }),
      prisma.purchase.aggregate({
        where: { ...where, status: PurchaseStatus.SUCCESS },
        _sum: { quantity: true },
      }),
    ]);

    // Get marketplace fee setting from database
    let marketplaceFeePercentage = 7; // Default to 7%
    try {
      const feeSetting = await prisma.setting.findUnique({
        where: { key: "marketplace_fee_percentage" },
      });
      if (feeSetting) {
        marketplaceFeePercentage = parseFloat(feeSetting.value);
      }
    } catch (e) {
      // Settings table might not exist yet, use default
      console.log("Settings table not available, using default fee:", e);
    }
    const feeMultiplier = 1 - (marketplaceFeePercentage / 100); // e.g., 0.93 for 7%

    // Build SQL WHERE clause for filtering (to match Prisma where clause)
    // This ensures stats are based on FILTERED data, not all data
    let sqlWhereClause = "status = 'SUCCESS'";
    const sqlParams: unknown[] = [];
    
    if (eventId) {
      sqlParams.push(eventId);
      sqlWhereClause += ` AND event_id = $${sqlParams.length}`;
    }
    
    if (search) {
      sqlParams.push(`%${search}%`);
      sqlWhereClause += ` AND account_id IN (SELECT id FROM accounts WHERE email ILIKE $${sqlParams.length})`;
    }
    
    if (section) {
      sqlParams.push(`%${section}%`);
      sqlWhereClause += ` AND section ILIKE $${sqlParams.length}`;
    }
    
    if (row) {
      sqlParams.push(`%${row}%`);
      sqlWhereClause += ` AND row ILIKE $${sqlParams.length}`;
    }
    
    if (poNumber) {
      sqlParams.push(`%${poNumber}%`);
      sqlWhereClause += ` AND dashboard_po_number LIKE $${sqlParams.length}`;
    }
    
    if (orderNumber) {
      sqlParams.push(`%${orderNumber}%`);
      sqlWhereClause += ` AND order_number ILIKE $${sqlParams.length}`;
    }
    
    if (seats) {
      sqlParams.push(`%${seats}%`);
      sqlWhereClause += ` AND seats ILIKE $${sqlParams.length}`;
    }
    
    if (posSync === "synced") {
      sqlWhereClause += ` AND pos_synced_at IS NOT NULL`;
    } else if (posSync === "not_synced") {
      sqlWhereClause += ` AND pos_synced_at IS NULL`;
    }
    
    if (accountId) {
      sqlParams.push(accountId);
      sqlWhereClause += ` AND account_id = $${sqlParams.length}`;
    }
    
    if (cardId) {
      sqlParams.push(cardId);
      sqlWhereClause += ` AND card_id = $${sqlParams.length}`;
    } else if (hasCard === "yes") {
      sqlWhereClause += ` AND card_id IS NOT NULL`;
    } else if (hasCard === "no") {
      sqlWhereClause += ` AND card_id IS NULL`;
    }
    
    if (minPrice) {
      sqlParams.push(parseFloat(minPrice));
      sqlWhereClause += ` AND total_price >= $${sqlParams.length}`;
    }
    
    if (maxPrice) {
      sqlParams.push(parseFloat(maxPrice));
      sqlWhereClause += ` AND total_price <= $${sqlParams.length}`;
    }
    
    if (minQuantity) {
      sqlParams.push(parseInt(minQuantity, 10));
      sqlWhereClause += ` AND quantity >= $${sqlParams.length}`;
    }
    
    if (maxQuantity) {
      sqlParams.push(parseInt(maxQuantity, 10));
      sqlWhereClause += ` AND quantity <= $${sqlParams.length}`;
    }
    
    if (startDate) {
      sqlParams.push(new Date(startDate));
      sqlWhereClause += ` AND created_at >= $${sqlParams.length}`;
    }
    
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      sqlParams.push(endDateTime);
      sqlWhereClause += ` AND created_at <= $${sqlParams.length}`;
    }

    // ========================================================================================
    // RAW SQL SECTION
    // The queries below use raw SQL for performance reasons:
    // - Batch fetching multiple purchases/events with complex filters
    // - Join queries across multiple tables (venues, zones, sections)
    // - PostgreSQL array operations (ANY clause) for bulk ID lookups
    // These are more efficient than multiple Prisma queries or in-memory processing
    // ========================================================================================

    // Get ALL successful purchases matching filter (not paginated) for calculating unrealized profit/sales
    // This ensures stats are consistent with filtered data
    const allSuccessfulPurchases: Array<{
      id: string;
      eventId: string | null;
      quantity: number;
      totalPrice: { toNumber: () => number } | null;
      section: string | null;
      price_override_type: string | null;
      price_override_zone: string | null;
      price_override_value: number | null;
    }> = await prisma.$queryRawUnsafe(`
      SELECT id, event_id as "eventId", quantity, total_price as "totalPrice", section,
             price_override_type, price_override_zone, price_override_value
      FROM purchases 
      WHERE ${sqlWhereClause}
    `, ...sqlParams);

    // Get get-in prices for ALL events (not just events on current page)
    const allEventIds = allSuccessfulPurchases.map(p => p.eventId).filter(Boolean) as string[];
    const getInPricesForStats: Array<{id: string, get_in_price: number | null}> = allEventIds.length > 0 
      ? await prisma.$queryRaw`
          SELECT id, get_in_price 
          FROM events WHERE id = ANY(${allEventIds}::text[])
        `
      : [];
    
    const statsPriceMap = new Map(getInPricesForStats.map(p => [p.id, p.get_in_price]));
    
    // Get zone prices for ALL events
    const allZonePricesRaw: Array<{event_id: string, zone_name: string, min_price: number}> = allEventIds.length > 0
      ? await prisma.$queryRaw`
          SELECT event_id, zone_name, min_price 
          FROM event_zone_prices WHERE event_id = ANY(${allEventIds}::text[])
        `
      : [];
    
    const statsZonePriceMap = new Map<string, Map<string, number>>();
    for (const zp of allZonePricesRaw) {
      if (!statsZonePriceMap.has(zp.event_id)) {
        statsZonePriceMap.set(zp.event_id, new Map());
      }
      statsZonePriceMap.get(zp.event_id)!.set(zp.zone_name, Number(zp.min_price));
    }

    // Get venue IDs for all events (for section price lookup)
    const eventVenueIds: Array<{id: string, venue_id: string | null}> = allEventIds.length > 0
      ? await prisma.$queryRaw`
          SELECT id, venue_id FROM events WHERE id = ANY(${allEventIds}::text[])
        `
      : [];
    const statsEventToVenueMap = new Map(eventVenueIds.map(e => [e.id, e.venue_id]));
    const statsVenueIds = [...new Set(eventVenueIds.map(e => e.venue_id).filter(Boolean))] as string[];

    // Get section prices for all venues
    const statsSectionPricesRaw: Array<{venue_id: string, section_name: string, min_price: number | null}> = statsVenueIds.length > 0
      ? await prisma.$queryRaw`
          SELECT vm.venue_id, vsz.section_name, vsz.min_price
          FROM venue_section_zones vsz
          JOIN venue_zones vz ON vsz.venue_zone_id = vz.id
          JOIN venue_maps vm ON vz.venue_map_id = vm.id
          WHERE vm.venue_id = ANY(${statsVenueIds}::text[])
        `
      : [];

    // Build a map: venueId -> sectionName -> minPrice for stats
    const statsSectionPriceMap = new Map<string, Map<string, number>>();
    for (const sp of statsSectionPricesRaw) {
      if (!statsSectionPriceMap.has(sp.venue_id)) {
        statsSectionPriceMap.set(sp.venue_id, new Map());
      }
      if (sp.min_price) {
        statsSectionPriceMap.get(sp.venue_id)!.set(sp.section_name, Number(sp.min_price));
      }
    }

    // Calculate unrealized profit, sales, and cost across ALL successful purchases
    let unrealizedProfit = 0;
    let unrealizedSales = 0;
    let costWithGetInPrices = 0;

    for (const purchase of allSuccessfulPurchases) {
      const totalPrice = typeof purchase.totalPrice === 'number' 
        ? purchase.totalPrice 
        : Number(purchase.totalPrice) || 0;
      const trueUnitCost = purchase.quantity > 0 ? totalPrice / purchase.quantity : 0;
      const getInPrice = purchase.eventId ? statsPriceMap.get(purchase.eventId) : null;
      const eventZones = purchase.eventId ? statsZonePriceMap.get(purchase.eventId) : null;
      
      // Determine comparison price using same logic as individual purchases
      let comparisonPrice: number | null = null;
      
      if (purchase.price_override_type === "manual" && purchase.price_override_value) {
        comparisonPrice = Number(purchase.price_override_value);
      } else if (purchase.price_override_type === "zone" && purchase.price_override_zone && eventZones) {
        comparisonPrice = eventZones.get(purchase.price_override_zone) || null;
      } else if (purchase.price_override_type === "section" && purchase.price_override_zone) {
        // Section selection - use actual section prices
        const sectionNames = purchase.price_override_zone.split(",").filter(Boolean);
        const matchedPrices: number[] = [];
        
        // Get section prices for this event's venue
        const venueId = purchase.eventId ? statsEventToVenueMap.get(purchase.eventId) : null;
        const venueSectionPrices = venueId ? statsSectionPriceMap.get(venueId) : null;
        
        for (const sectionName of sectionNames) {
          // First try exact section price lookup
          if (venueSectionPrices) {
            const exactPrice = venueSectionPrices.get(sectionName);
            if (exactPrice) {
              matchedPrices.push(exactPrice);
              continue;
            }
          }
          
          // Fallback: Find zone that contains this section and use zone price
          if (eventZones) {
            for (const [zoneName, zonePrice] of eventZones.entries()) {
              if (sectionName.toLowerCase().startsWith(zoneName.toLowerCase())) {
                matchedPrices.push(zonePrice);
                break;
              }
            }
          }
        }
        
        if (matchedPrices.length > 0) {
          comparisonPrice = Math.min(...matchedPrices);
        }
      } else if (purchase.price_override_type === "get_in") {
        comparisonPrice = getInPrice ? Number(getInPrice) : null;
      } else {
        // Auto-match: try to match section to zone
        if (purchase.section && eventZones && eventZones.size > 0) {
          const autoZone = mapSectionToZone(purchase.section);
          if (autoZone) {
            comparisonPrice = eventZones.get(autoZone) || null;
          }
        }
        // Fallback to get-in price
        if (!comparisonPrice) {
          comparisonPrice = getInPrice ? Number(getInPrice) : null;
        }
      }

      if (comparisonPrice && trueUnitCost > 0) {
        // Profit formula: (sale * (1 - fee%)) - cost
        const saleAfterFees = comparisonPrice * feeMultiplier;
        const profitPerTicket = saleAfterFees - trueUnitCost;
        unrealizedProfit += profitPerTicket * purchase.quantity;
        unrealizedSales += comparisonPrice * purchase.quantity;
        costWithGetInPrices += totalPrice;
      }
    }

    // Get get-in prices for events on current PAGE (for display in table)
    const pageEventIds = purchases.map(p => p.eventId).filter(Boolean) as string[];
    const getInPrices: Array<{id: string, get_in_price: number | null, get_in_price_url: string | null, get_in_price_updated_at: Date | null}> = pageEventIds.length > 0 
      ? await prisma.$queryRaw`
          SELECT id, get_in_price, get_in_price_url, get_in_price_updated_at 
          FROM events WHERE id = ANY(${pageEventIds}::text[])
        `
      : [];
    
    const priceMap = new Map(getInPrices.map(p => [p.id, p]));
    
    // Get zone prices for events on current PAGE
    const zonePricesRaw: Array<{event_id: string, zone_name: string, min_price: number}> = pageEventIds.length > 0
      ? await prisma.$queryRaw`
          SELECT event_id, zone_name, min_price 
          FROM event_zone_prices WHERE event_id = ANY(${pageEventIds}::text[])
        `
      : [];
    
    // Group zone prices by event ID
    const zonePriceMap = new Map<string, ZonePriceRecord[]>();
    for (const zp of zonePricesRaw) {
      const existing = zonePriceMap.get(zp.event_id) || [];
      existing.push({ zone_name: zp.zone_name, min_price: Number(zp.min_price) });
      zonePriceMap.set(zp.event_id, existing);
    }
    
    // Get purchase override fields using raw query (to avoid Prisma client regeneration issues)
    const purchaseOverrides: Array<{
      id: string;
      price_override_type: string | null;
      price_override_zone: string | null;
      price_override_value: number | null;
    }> = await prisma.$queryRaw`
      SELECT id, price_override_type, price_override_zone, price_override_value
      FROM purchases WHERE id = ANY(${purchases.map(p => p.id)}::text[])
    `;
    const overrideMap = new Map(purchaseOverrides.map(po => [po.id, po]));
    
    // Get section prices for events that have section-type overrides
    // Query venue_section_zones through venue_zones and venue_maps linked by event's venue_id
    const eventsWithVenueIds = purchases
      .filter(p => p.eventId && p.event?.venueId)
      .map(p => ({ eventId: p.eventId!, venueId: p.event!.venueId }));
    
    const venueIds = [...new Set(eventsWithVenueIds.map(e => e.venueId).filter(Boolean))] as string[];
    
    // Query section prices from venue_section_zones
    interface SectionPriceRecord {
      venue_id: string;
      zone_name: string;
      section_name: string;
      min_price: number | null;
    }
    const sectionPricesRaw: SectionPriceRecord[] = venueIds.length > 0
      ? await prisma.$queryRaw`
          SELECT vm.venue_id, vz.zone_name, vsz.section_name, vsz.min_price
          FROM venue_section_zones vsz
          JOIN venue_zones vz ON vsz.venue_zone_id = vz.id
          JOIN venue_maps vm ON vz.venue_map_id = vm.id
          WHERE vm.venue_id = ANY(${venueIds}::text[])
        `
      : [];
    
    // Build a map: venueId -> sectionName -> minPrice
    const sectionPriceMap = new Map<string, Map<string, number>>();
    for (const sp of sectionPricesRaw) {
      if (!sectionPriceMap.has(sp.venue_id)) {
        sectionPriceMap.set(sp.venue_id, new Map());
      }
      if (sp.min_price) {
        sectionPriceMap.get(sp.venue_id)!.set(sp.section_name, Number(sp.min_price));
      }
    }
    
    // Also build a venueId map from eventId for quick lookup
    const eventToVenueMap = new Map<string, string>();
    for (const ev of eventsWithVenueIds) {
      if (ev.venueId) {
        eventToVenueMap.set(ev.eventId, ev.venueId);
      }
    }
    
    // Format purchases for display (paginated list)
    const formattedPurchases = purchases.map((p) => {
      const eventPriceData = p.eventId ? priceMap.get(p.eventId) : null;
      const eventZonePrices = p.eventId ? zonePriceMap.get(p.eventId) || [] : [];
      const purchaseOverride = overrideMap.get(p.id);
      const totalPrice = p.totalPrice?.toNumber() || 0;
      // Calculate TRUE unit cost: total price (with fees) / quantity
      const trueUnitCost = p.quantity > 0 ? totalPrice / p.quantity : 0;
      const getInPrice = eventPriceData?.get_in_price ? Number(eventPriceData.get_in_price) : null;
      
      // Determine the comparison price based on override settings
      let comparisonPrice: number | null = null;
      let comparisonSource: string | null = null;
      let matchedZone: string | null = null;
      
      const overrideType = purchaseOverride?.price_override_type;
      const overrideZone = purchaseOverride?.price_override_zone;
      const overrideValue = purchaseOverride?.price_override_value ? Number(purchaseOverride.price_override_value) : null;
      
      if (overrideType === "manual" && overrideValue) {
        // Manual override - use the specified value
        comparisonPrice = overrideValue;
        comparisonSource = "manual";
      } else if (overrideType === "zone" && overrideZone) {
        // Explicit zone selection
        const zp = eventZonePrices.find(z => z.zone_name === overrideZone);
        if (zp) {
          comparisonPrice = zp.min_price;
          comparisonSource = "zone";
          matchedZone = overrideZone;
        }
      } else if (overrideType === "section" && overrideZone) {
        // Section selection - overrideZone contains comma-separated section names like "Garden Boxes 3,Garden Boxes 5"
        // Look up actual section-specific prices from the database
        const sectionNames = overrideZone.split(",").filter(Boolean);
        const matchedSectionPrices: number[] = [];
        const matchedSectionsSet = new Set<string>();
        
        // Get section prices for this event's venue
        const venueId = p.eventId ? eventToVenueMap.get(p.eventId) : null;
        const venueSectionPrices = venueId ? sectionPriceMap.get(venueId) : null;
        
        for (const sectionName of sectionNames) {
          // First try exact section price lookup
          if (venueSectionPrices) {
            const exactPrice = venueSectionPrices.get(sectionName);
            if (exactPrice) {
              matchedSectionPrices.push(exactPrice);
              matchedSectionsSet.add(sectionName);
              continue;
            }
          }
          
          // Fallback: Find zone that contains this section and use zone price
          for (const zp of eventZonePrices) {
            if (sectionName.toLowerCase().startsWith(zp.zone_name.toLowerCase())) {
              matchedSectionPrices.push(zp.min_price);
              matchedSectionsSet.add(sectionName);
              break;
            }
          }
        }
        
        if (matchedSectionPrices.length > 0) {
          // Use the minimum price among matched sections
          comparisonPrice = Math.min(...matchedSectionPrices);
          comparisonSource = "section";
          matchedZone = Array.from(matchedSectionsSet).join(", ");
        }
      } else if (overrideType === "get_in") {
        // Explicit get-in price selection
        comparisonPrice = getInPrice;
        comparisonSource = "get_in";
      } else {
        // Auto-match: try to match section to zone
        if (p.section && eventZonePrices.length > 0) {
          const autoZone = mapSectionToZone(p.section);
          if (autoZone) {
            const zp = eventZonePrices.find(z => z.zone_name === autoZone);
            if (zp) {
              comparisonPrice = zp.min_price;
              comparisonSource = "auto_zone";
              matchedZone = autoZone;
            }
          }
        }
        
        // Fallback to get-in price if no zone match
        if (!comparisonPrice) {
          comparisonPrice = getInPrice;
          comparisonSource = getInPrice ? "get_in" : null;
        }
      }
      
      return {
        id: p.id,
        externalJobId: p.externalJobId,
        tmOrderNumber: (p as { tmOrderNumber?: string | null }).tmOrderNumber || null,
        status: p.status,
        quantity: p.quantity,
        priceEach: trueUnitCost, // Use TRUE unit cost (total / quantity)
        totalPrice,
        section: p.section,
        row: p.row,
        seats: p.seats,
        errorCode: p.errorCode,
        errorMessage: p.errorMessage,
        checkoutUrl: p.checkoutUrl,
        confirmationUrl: p.confirmationUrl,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
        attemptCount: p.attemptCount,
        // Price override fields
        priceOverrideType: overrideType || null,
        priceOverrideZone: overrideZone || null,
        priceOverrideValue: overrideValue,
        // Comparison price info
        comparisonPrice,
        comparisonSource,
        matchedZone,
        // POS sync fields
        dashboardPoNumber: (p as { dashboardPoNumber?: string | null }).dashboardPoNumber || null,
        posSyncedAt: (p as { posSyncedAt?: Date | null }).posSyncedAt || null,
        posTicketGroupId: (p as { posTicketGroupId?: number | null }).posTicketGroupId || null,
        posPurchaseOrderId: (p as { posPurchaseOrderId?: number | null }).posPurchaseOrderId || null,
        account: {
          id: p.account.id,
          email: p.account.email,
        },
        event: p.event
          ? {
              id: p.event.id,
              tmEventId: p.event.tmEventId,
              name: p.event.eventName,
              eventDate: p.event.eventDateRaw || null,
              venue: p.event.venue || null,
              getInPrice,
              getInPriceUrl: eventPriceData?.get_in_price_url || null,
              getInPriceUpdatedAt: eventPriceData?.get_in_price_updated_at || null,
              zonePrices: eventZonePrices.map(zp => ({
                zoneName: zp.zone_name,
                minPrice: zp.min_price,
              })),
            }
          : null,
        card: p.card
          ? {
              id: p.card.id,
              type: p.card.cardType,
              last4: p.card.cardNumber.slice(-4),
            }
          : null,
      };
    });

    // Filter to only show events with purchases in the dropdown
    const eventsWithPurchases = events
      .filter((e) => e._count.purchases > 0)
      .map((e) => ({
        id: e.id,
        name: e.eventName, // Use full event name for clarity
        eventDate: e.eventDateRaw,
        venue: e.venue,
        count: e._count.purchases,
      }));

    return NextResponse.json({
      purchases: formattedPurchases,
      events: eventsWithPurchases,
      accounts: accountsWithPurchases.map(a => ({
        id: a.id,
        email: a.email,
        count: a._count.purchases,
      })),
      cards: cardsForFilter.map(c => ({
        id: c.id,
        type: c.cardType,
        last4: c.cardNumber.slice(-4),
        count: c._count.purchases,
      })),
      stats: {
        checkouts: successCount,
        totalTickets: ticketSumResult._sum.quantity || 0,
        revenue: Math.round(costWithGetInPrices * 100) / 100, // Only purchases with get-in prices
        unrealizedProfit: Math.round(unrealizedProfit * 100) / 100, // Round to 2 decimals
        unrealizedSales: Math.round(unrealizedSales * 100) / 100, // Round to 2 decimals
        roi: costWithGetInPrices > 0
          ? Math.round((unrealizedProfit / costWithGetInPrices) * 10000) / 100 
          : 0, // ROI as percentage
        marketplaceFeePercentage, // Include fee for frontend calculations
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Purchases fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/purchases
 * Create a new purchase record manually
 * 
 * Request Body:
 * - accountId: (required) ID of the account making the purchase
 * - eventId: (optional) ID of the event
 * - cardId: (optional) ID of the card profile used
 * - status: (required) Purchase status - "SUCCESS", "FAILED", or "NEEDS_REVIEW"
 * - quantity: (optional) Number of tickets (default: 1)
 * - totalPrice: (optional) Total price paid
 * - section: (optional) Venue section
 * - row: (optional) Row number/letter
 * - seats: (optional) Seat numbers (e.g., "1-4" or "5,6,7")
 * - confirmationUrl: (optional) Confirmation page URL
 * 
 * Response:
 * - success: boolean
 * - purchase: Created purchase details
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, eventId, cardId, status, quantity, totalPrice, section, row, seats, confirmationUrl } = body;

    // Validate required fields
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    if (!status || !["SUCCESS", "FAILED", "NEEDS_REVIEW"].includes(status)) {
      return NextResponse.json({ error: "Valid status is required (SUCCESS, FAILED, NEEDS_REVIEW)" }, { status: 400 });
    }

    // Verify account exists
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Verify event exists if provided
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
    }

    // Verify card exists if provided
    let cardLast4: string | null = null;
    if (cardId) {
      const card = await prisma.card.findUnique({ where: { id: cardId } });
      if (!card) {
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
      }
      cardLast4 = card.cardNumber.slice(-4);
    }

    // Create the purchase
    const purchase = await prisma.purchase.create({
      data: {
        accountId,
        eventId: eventId || null,
        cardId: cardId || null,
        cardLast4,
        status: status as PurchaseStatus,
        quantity: quantity || 1,
        totalPrice: totalPrice ? parseFloat(totalPrice) : null,
        priceEach: totalPrice && quantity ? parseFloat(totalPrice) / quantity : null,
        section: section || null,
        row: row || null,
        seats: seats || null,
        confirmationUrl: confirmationUrl || null,
        attemptCount: 1,
      },
      include: {
        account: { select: { email: true } },
        event: { select: { eventName: true } },
        card: { select: { cardNumber: true, cardType: true } },
      },
    });

    // Automatically assign a PO number if status is SUCCESS
    let dashboardPoNumber = null;
    if (status === PurchaseStatus.SUCCESS) {
      try {
        dashboardPoNumber = await assignPoNumber(purchase.id);
      } catch (poError) {
        console.warn(`[Purchases API] Failed to assign PO number for purchase ${purchase.id}:`, poError);
      }
    }

    return NextResponse.json({
      success: true,
      purchase: {
        id: purchase.id,
        account: purchase.account.email,
        event: purchase.event?.eventName || null,
        card: purchase.card ? `${purchase.card.cardType} ****${purchase.card.cardNumber.slice(-4)}` : null,
        status: purchase.status,
        quantity: purchase.quantity,
        totalPrice: purchase.totalPrice?.toNumber() || null,
        dashboardPoNumber,
      },
    });
  } catch (error) {
    console.error("Create purchase error:", error);
    return NextResponse.json(
      { error: "Failed to create purchase", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/purchases
 * Bulk update purchases (e.g., change status for multiple purchases)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchaseIds, updates } = body;

    if (!purchaseIds || !Array.isArray(purchaseIds) || purchaseIds.length === 0) {
      return NextResponse.json(
        { error: "purchaseIds array is required" },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "updates object is required" },
        { status: 400 }
      );
    }

    // Build update data - only allow safe fields
    const updateData: Record<string, unknown> = {};

    if (updates.status !== undefined) {
      const validStatuses = ["SUCCESS", "FAILED", "NEEDS_REVIEW"];
      if (!validStatuses.includes(updates.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updateData.status = updates.status as PurchaseStatus;
    }

    if (updates.eventId !== undefined) {
      updateData.eventId = updates.eventId || null;
    }

    if (updates.cardId !== undefined) {
      updateData.cardId = updates.cardId || null;
    }
    
    // Price override fields
    if (updates.priceOverrideType !== undefined) {
      const validTypes = ["get_in", "zone", "section", "manual", null];
      if (!validTypes.includes(updates.priceOverrideType)) {
        return NextResponse.json({ error: "Invalid priceOverrideType" }, { status: 400 });
      }
      updateData.priceOverrideType = updates.priceOverrideType || null;
    }
    
    if (updates.priceOverrideZone !== undefined) {
      updateData.priceOverrideZone = updates.priceOverrideZone || null;
    }
    
    if (updates.priceOverrideValue !== undefined) {
      updateData.priceOverrideValue = updates.priceOverrideValue != null 
        ? parseFloat(updates.priceOverrideValue) 
        : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    // Perform bulk update
    const result = await prisma.purchase.updateMany({
      where: { id: { in: purchaseIds } },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      updated: result.count,
    });
  } catch (error) {
    console.error("Bulk update purchases error:", error);
    return NextResponse.json(
      { error: "Failed to bulk update purchases" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/purchases
 * Bulk delete purchases
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchaseIds, externalJobIds } = body;

    // Can delete by purchaseIds (internal IDs) or externalJobIds (job IDs from import)
    if (purchaseIds && Array.isArray(purchaseIds) && purchaseIds.length > 0) {
      const result = await prisma.purchase.deleteMany({
        where: { id: { in: purchaseIds } },
      });

      return NextResponse.json({
        success: true,
        deleted: result.count,
      });
    }

    if (externalJobIds && Array.isArray(externalJobIds) && externalJobIds.length > 0) {
      const result = await prisma.purchase.deleteMany({
        where: { externalJobId: { in: externalJobIds } },
      });

      return NextResponse.json({
        success: true,
        deleted: result.count,
      });
    }

    return NextResponse.json(
      { error: "purchaseIds or externalJobIds array is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Bulk delete purchases error:", error);
    return NextResponse.json(
      { error: "Failed to bulk delete purchases" },
      { status: 500 }
    );
  }
}
