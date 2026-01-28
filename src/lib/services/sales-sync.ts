/**
 * Sales Sync Service
 *
 * Handles synchronization of sales and invoices from TicketVault POS:
 * 1. Syncing sales queue to local database
 * 2. Syncing invoices to local database
 * 3. Linking sales to listings and invoices
 * 4. Linking tickets to sales
 *
 * =============================================================================
 * CRITICAL: PROFIT CALCULATION DOCUMENTATION
 * =============================================================================
 *
 * Data Model Hierarchy:
 *   Purchase -> Listing -> Sale -> Invoice
 *
 * Key Relationships:
 * - One Invoice can contain MULTIPLE Sales
 *   (Example: A buyer purchases tickets from 2 of our listings in one transaction
 *   = 1 Invoice with 2 Sales)
 * - One Sale belongs to exactly ONE Invoice
 * - One Listing can have MULTIPLE Sales (partial quantity sold over time)
 *
 * PROFIT CALCULATION:
 * -------------------
 * Total Profit = Total Revenue - Total Cost
 *
 * REVENUE (from TicketVault):
 * - Sum of invoice.totalAmount = NET payout from TicketVault (AFTER their fees)
 * - This is the actual money we receive
 *
 * COST (derived from OUR Purchase records, NOT TicketVault):
 * - For each sale: cost = (purchase.totalPrice / purchase.quantity) * sale.quantity
 * - Total cost = Sum of all sale costs
 * - This ensures we use our actual purchase prices, not what TicketVault thinks
 *
 * Why we derive cost ourselves:
 * - TicketVault's cost data may be incomplete or inaccurate
 * - Our Purchase records have the true cost we paid
 * - We control the data integrity
 *
 * =============================================================================
 */

import prisma from "@/lib/db";
import { TicketStatus } from "@prisma/client";
import {
  TicketVaultApi,
  SalesQueueItem,
  InvoiceItem,
} from "./ticketvault-api";
import { EventMatcher } from "./event-matcher";
import { TicketService } from "./ticket-service";

// =============================================================================
// Types
// =============================================================================

export interface SalesSyncResult {
  success: boolean;
  synced: number;
  created: number;
  updated: number;
  linked: number;
  error?: string;
}

export interface InvoicesSyncResult {
  success: boolean;
  synced: number;
  created: number;
  updated: number;
  error?: string;
}

/**
 * Sales Statistics
 *
 * PROFIT CALCULATION:
 * - totalRevenue = Sum of invoice.totalAmount (net payout from TicketVault after fees)
 * - totalCost = Derived from our Purchase records (purchase.totalPrice / purchase.quantity * sale.quantity)
 * - totalProfit = totalRevenue - totalCost
 */
export interface SalesStats {
  totalSales: number;
  pendingSales: number;       // Status 20 (Pending) or 40 (Alert)
  completedSales: number;     // Status 1 (Complete) or isComplete flag
  totalRevenue: number;       // From invoices - NET payout after fees
  totalCost: number;          // Derived from our Purchase records
  totalProfit: number;        // totalRevenue - totalCost
  avgProfitPerDay: number;
  daysWithSales: number;
}

export interface InvoiceStats {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalRevenue: number;
  totalUnpaid: number;
}

// =============================================================================
// Sync Functions
// =============================================================================

/**
 * Sync sales from TicketVault sales queue to local database
 */
export async function syncSalesFromPos(): Promise<SalesSyncResult> {
  try {
    console.log("[SalesSync] Starting sales sync from POS...");

    // Fetch sales from POS
    const posSales = await TicketVaultApi.getSalesQueue({ limit: 500 });
    console.log(`[SalesSync] Found ${posSales.length} sales in POS`);

    // Log first sale to debug field names
    if (posSales.length > 0) {
      console.log("[SalesSync] Sample sale fields:", Object.keys(posSales[0]));
      console.log("[SalesSync] First sale data:", JSON.stringify(posSales[0], null, 2));
    }

    let created = 0;
    let updated = 0;
    let linked = 0;
    let ticketsLinked = 0;

    for (const posSale of posSales) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sale = posSale as any; // Type assertion for flexible field access
        
        // Find matching listing by ticketGroupId
        const ticketGroupId = sale.TicketGroupID || sale.TicketGroupId;
        const listing = await prisma.listing.findUnique({
          where: { ticketGroupId },
          include: {
            purchase: {
              select: { eventId: true, dashboardPoNumber: true },
            },
          },
        });
        
        // If no listing found, try to match to purchase by section/row/seats
        let matchedPurchase: { dashboardPoNumber: string | null; eventId: string | null } | null = null;
        if (!listing && sale.Section && sale.Row && sale.Seats) {
          // Parse the seats
          const seatMatch = sale.Seats?.match(/^(\d+)-(\d+)$/);
          let startSeat: number | null = null;
          let endSeat: number | null = null;
          
          if (seatMatch) {
            startSeat = parseInt(seatMatch[1], 10);
            endSeat = parseInt(seatMatch[2], 10);
          } else if (sale.Seats) {
            const single = parseInt(sale.Seats, 10);
            if (!isNaN(single)) {
              startSeat = single;
              endSeat = single;
            }
          }
          
          if (startSeat !== null) {
            // Find purchases with matching section/row
            const purchases = await prisma.purchase.findMany({
              where: {
                section: sale.Section,
                row: sale.Row,
              },
              select: {
                dashboardPoNumber: true,
                eventId: true,
                seats: true,
              },
            });
            
            // Find one where seats match
            for (const purchase of purchases) {
              const purchaseSeatMatch = purchase.seats?.match(/^(\d+)-(\d+)$/);
              let purchaseStart: number | null = null;
              let purchaseEnd: number | null = null;
              
              if (purchaseSeatMatch) {
                purchaseStart = parseInt(purchaseSeatMatch[1], 10);
                purchaseEnd = parseInt(purchaseSeatMatch[2], 10);
              } else if (purchase.seats) {
                const single = parseInt(purchase.seats, 10);
                if (!isNaN(single)) {
                  purchaseStart = single;
                  purchaseEnd = single;
                }
              }
              
              if (purchaseStart !== null && purchaseEnd !== null && 
                  startSeat >= purchaseStart && (endSeat ?? startSeat) <= purchaseEnd) {
                matchedPurchase = purchase;
                break;
              }
            }
          }
        }

        // Parse invoice number (can be string or number)
        const invoiceNum = sale.InvoiceNumber || sale.InvoiceId;
        const parsedInvoiceNumber = invoiceNum ? parseInt(String(invoiceNum), 10) : null;
        
        // Check if invoice exists before linking
        let invoiceExists = false;
        if (parsedInvoiceNumber) {
          const invoice = await prisma.invoice.findUnique({
            where: { invoiceNumber: parsedInvoiceNumber },
          });
          invoiceExists = !!invoice;
        }
        
        // Get quantity - from API: Qty
        const quantity = sale.Qty || sale.Quantity || sale.TicketCount || 1;
        
        // Get sale price - from API: Total (total sale price for this sale)
        const salePrice = sale.Total || sale.SalePrice || sale.Price || 0;
        
        // Get event name - from API: Performer
        const eventName = sale.Performer || sale.PrimaryEventName || sale.EventName || null;
        
        // Get venue - from API: Venue
        const venueName = sale.Venue || sale.VenueName || null;
        
        // Get event date - from API: EventDate
        const eventDateStr = sale.EventDate || sale.EventDateTime;
        const eventDateTime = eventDateStr ? new Date(eventDateStr) : null;
        
        // Get buyer name from first + last name
        const buyerName = (sale.BuyerFirstName && sale.BuyerLastName) 
          ? `${sale.BuyerFirstName} ${sale.BuyerLastName}`.trim()
          : sale.BuyerName || sale.ClientName || null;
        
        // Find or derive eventId
        let eventId: string | null = null;
        
        // First try from listing's purchase
        if (listing?.purchase?.eventId) {
          eventId = listing.purchase.eventId;
        } else if (listing?.eventId) {
          eventId = listing.eventId;
        } else if (matchedPurchase?.eventId) {
          // Got eventId from matched purchase (no listing case)
          eventId = matchedPurchase.eventId;
        } else if (eventName && eventDateTime) {
          // Try to find/create event
          try {
            const eventResult = await EventMatcher.findOrCreateEvent({
              eventName,
              venue: venueName || undefined,
              eventDate: eventDateTime,
            });
            eventId = eventResult.event?.id || null;
          } catch (eventError) {
            console.warn(`[SalesSync] Could not match/create event for ${eventName}:`, eventError);
          }
        }

        // Get section/row/seats for ticket linking
        const section = sale.Section || null;
        const row = sale.Row || null;
        const seats = sale.Seats || null;

        // Check for existing sale to preserve cost if needed
        const existingSale = await prisma.sale.findUnique({
          where: {
            ticketGroupId_orderId: {
              ticketGroupId,
              orderId: sale.OrderID || sale.OrderId || sale.SaleRequestId || 0,
            },
          },
          select: { id: true, cost: true },
        });

        // Prepare sale data - only set invoiceNumber if invoice exists
        // IMPORTANT: Preserve existing cost if API doesn't provide one
        const saleData = {
          ticketGroupId,
          invoiceNumber: invoiceExists ? parsedInvoiceNumber : null,
          orderId: sale.OrderID || sale.OrderId || sale.SaleRequestId || null,
          eventName,
          eventDateTime,
          venueName,
          section,
          row,
          seats,
          quantity,
          salePrice,
          // Preserve existing cost - don't overwrite with null from API
          cost: sale.Cost || (existingSale?.cost ? existingSale.cost : null),
          buyerEmail: sale.BuyerEmail || sale.ClientEmail || null,
          buyerName,
          status: sale.Status || 0,
          statusName: sale.StatusName || null,
          deliveryType: sale.DeliveryTypeName || String(sale.DeliveryTypeId || '') || null,
          transferType: sale.TransferTypeName || String(sale.SaltTransferTypeId || '') || null,
          isComplete: sale.IsDelivered ?? sale.IsComplete ?? false,
          needsShipping: sale.NeedsShipping ?? sale.IsNeedToShip ?? false,
          mobileInfoNeeded: sale.IsMobileInfoNeeded ?? false,
          pdfBcMissing: sale.IsPdfBcMissing ?? false,
          extOrderNumber: sale.ExtOrderNumber || null,
          // Get PO number from: API -> listing -> matched purchase
          extPONumber: sale.ExtPONumber || sale.PONumber || listing?.extPONumber || listing?.purchase?.dashboardPoNumber || matchedPurchase?.dashboardPoNumber || null,
          saleDate: sale.ReceivedDate ? new Date(sale.ReceivedDate) : null,
          lastSyncedAt: new Date(),
          listingId: listing?.id || null,
          eventId,
        };

        // Upsert sale
        let saleId: string;
        
        if (existingSale) {
          await prisma.sale.update({
            where: { id: existingSale.id },
            data: saleData,
          });
          saleId = existingSale.id;
          updated++;
        } else {
          const newSale = await prisma.sale.create({
            data: saleData,
          });
          saleId = newSale.id;
          created++;
        }

        if (listing) {
          linked++;
        }
        
        // Link tickets to this sale
        if (eventId && section && row && seats) {
          const linkResult = await TicketService.linkTicketsToSale(
            saleId,
            eventId,
            section,
            row,
            seats
          );
          ticketsLinked += linkResult.linked;
        }
      } catch (saleError) {
        console.warn(
          `[SalesSync] Error processing sale for TG ${posSale.TicketGroupID}:`,
          saleError
        );
      }
    }

    console.log(
      `[SalesSync] Sync complete: ${created} created, ${updated} updated, ${linked} linked to listings, ${ticketsLinked} tickets linked`
    );

    // Re-link any unlinked sales that now have matching listings
    const relinked = await relinkUnlinkedSales();
    
    return {
      success: true,
      synced: posSales.length,
      created,
      updated,
      linked: linked + relinked,
    };
  } catch (error) {
    console.error("[SalesSync] Sync error:", error);
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

/**
 * Re-link unlinked sales to listings by ticketGroupId
 * This handles the case where sales were synced before listings
 */
export async function relinkUnlinkedSales(): Promise<number> {
  try {
    console.log("[SalesSync] Re-linking unlinked sales...");
    
    // Find all sales without a listingId
    const unlinkedSales = await prisma.sale.findMany({
      where: { listingId: null },
      select: { id: true, ticketGroupId: true },
    });
    
    if (unlinkedSales.length === 0) {
      console.log("[SalesSync] No unlinked sales found");
      return 0;
    }
    
    console.log(`[SalesSync] Found ${unlinkedSales.length} unlinked sales`);
    
    let relinked = 0;
    
    for (const sale of unlinkedSales) {
      // Try to find a listing with matching ticketGroupId
      const listing = await prisma.listing.findUnique({
        where: { ticketGroupId: sale.ticketGroupId },
        select: { id: true },
      });
      
      if (listing) {
        await prisma.sale.update({
          where: { id: sale.id },
          data: { listingId: listing.id },
        });
        relinked++;
      }
    }
    
    console.log(`[SalesSync] Re-linked ${relinked} sales to listings`);
    return relinked;
  } catch (error) {
    console.error("[SalesSync] Re-link error:", error);
    return 0;
  }
}

/**
 * Sync invoices from TicketVault to local database
 */
export async function syncInvoicesFromPos(): Promise<InvoicesSyncResult> {
  try {
    console.log("[SalesSync] Starting invoices sync from POS...");

    // Fetch invoices from POS (both paid and unpaid)
    const posInvoices = await TicketVaultApi.getInvoices({ take: 500 });
    console.log(`[SalesSync] Found ${posInvoices.length} invoices in POS`);

    // Log first invoice to debug field names
    if (posInvoices.length > 0) {
      console.log("[SalesSync] Sample invoice fields:", Object.keys(posInvoices[0]));
      console.log("[SalesSync] First invoice data:", JSON.stringify(posInvoices[0], null, 2));
    }

    let created = 0;
    let updated = 0;

    for (const posInvoice of posInvoices) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = posInvoice as any; // Type assertion for flexible field access
        
        // Parse invoice number (can be string or number)
        const invoiceNumber = typeof inv.InvoiceNumber === 'string' 
          ? parseInt(inv.InvoiceNumber, 10) 
          : inv.InvoiceNumber;
        
        // Get total amount - TicketVault uses "Payout" for total payout amount
        const totalAmount = inv.Payout || inv.TotalAmount || inv.Total || 0;
        
        // Get quantity
        const totalQuantity = inv.Quantity || inv.Qty || 0;
        
        // Get event name (not available in invoice API, will be populated from sales)
        const eventName = inv.PrimaryEventName || inv.EventName || null;
        
        // Prepare invoice data
        const invoiceData = {
          invoiceNumber,
          clientId: inv.ClientId || inv.ClientID || null,
          clientName: inv.Client || inv.ClientName || null,
          clientEmail: inv.AccountEmail || inv.ClientEmail || null,
          eventName,
          eventDateTime: inv.EventDateTime || inv.EventDate
            ? new Date(inv.EventDateTime || inv.EventDate)
            : null,
          totalQuantity,
          totalAmount,
          fees: inv.TVFee || inv.Fees || 0,
          totalCost: inv.TotalCost || inv.Cost || 0,
          isPaid: inv.Paid ?? inv.IsPaid ?? false,
          payoutStatus: inv.InvoiceStatus || inv.PayoutStatus || null,
          remittanceStatus: inv.RemittancePayments || inv.RemittanceStatus || null,
          remittanceDate: (inv.MaxRemittanceDate && inv.MaxRemittanceDate !== "0001-01-01T00:00:00")
            ? new Date(inv.MaxRemittanceDate)
            : null,
          isCancelled: inv.IsCancelled ?? false,
          extPONumber: inv.ExtPONumber || null,
          invoiceDate: inv.Created
            ? new Date(inv.Created)
            : null,
          lastSyncedAt: new Date(),
        };

        // Upsert invoice
        const existingInvoice = await prisma.invoice.findUnique({
          where: { invoiceNumber },
        });

        if (existingInvoice) {
          await prisma.invoice.update({
            where: { id: existingInvoice.id },
            data: invoiceData,
          });
          updated++;
        } else {
          await prisma.invoice.create({
            data: invoiceData,
          });
          created++;
        }
      } catch (invoiceError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = posInvoice as any;
        console.warn(
          `[SalesSync] Error processing invoice ${inv.InvoiceNumber}:`,
          invoiceError
        );
      }
    }

    console.log(
      `[SalesSync] Invoices sync complete: ${created} created, ${updated} updated`
    );

    return {
      success: true,
      synced: posInvoices.length,
      created,
      updated,
    };
  } catch (error) {
    console.error("[SalesSync] Invoices sync error:", error);
    return {
      success: false,
      synced: 0,
      created: 0,
      updated: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sync both sales and invoices
 */
export async function syncAllFromPos(): Promise<{
  sales: SalesSyncResult;
  invoices: InvoicesSyncResult;
}> {
  const [salesResult, invoicesResult] = await Promise.all([
    syncSalesFromPos(),
    syncInvoicesFromPos(),
  ]);

  return {
    sales: salesResult,
    invoices: invoicesResult,
  };
}

// =============================================================================
// Stats Functions
// =============================================================================

/**
 * Get sales statistics
 * 
 * TicketVault status values:
 * - Status 1 = Complete/Delivered
 * - Status 40 = Alert (confirmed, awaiting delivery)
 * - Status 20 = Pending (not confirmed)
 * 
 * PROFIT CALCULATION:
 * - Revenue: Sum of invoice.totalAmount (net payout from TicketVault after fees)
 * - Cost: Derived from our own Purchase records (NOT from TicketVault)
 *   - Cost per ticket = purchase.totalPrice / purchase.quantity
 *   - Sale cost = cost per ticket * sale.quantity
 * - Profit = Total Revenue - Total Cost (derived)
 */
export async function getSalesStats(): Promise<SalesStats> {
  const [totalSales, pendingSales, completedSales, allSales, invoiceAggregates] =
    await Promise.all([
      prisma.sale.count(),
      // Pending = Status 40 (Alert) + Status 20 (Pending) - not delivered yet
      prisma.sale.count({ 
        where: { 
          OR: [
            { status: 40 }, // Alert
            { status: 20 }, // Pending
          ],
        } 
      }),
      // Complete = Status 1 (delivered) or isComplete flag
      prisma.sale.count({ 
        where: { 
          OR: [
            { status: 1 },
            { isComplete: true },
          ],
        } 
      }),
      // Get all sales with their linked purchases AND extPONumber for direct matching
      prisma.sale.findMany({
        select: {
          saleDate: true,
          quantity: true,
          extPONumber: true, // For direct purchase matching
          listing: {
            select: {
              purchase: {
                select: {
                  totalPrice: true,
                  quantity: true,
                },
              },
            },
          },
        },
      }),
      // Get revenue from invoices (net payout after fees)
      prisma.invoice.aggregate({
        where: { isCancelled: false },
        _sum: {
          totalAmount: true, // Net payout after fees - this is our actual revenue
        },
      }),
    ]);

  // Revenue from invoices (net payout after TicketVault fees)
  const totalRevenue = Number(invoiceAggregates._sum.totalAmount || 0);
  
  // Calculate total cost from our own Purchase records
  // Priority: 1) Sale -> Listing -> Purchase, 2) Sale.extPONumber -> Purchase.dashboardPoNumber
  let totalCost = 0;
  const uniqueDays = new Set<string>();
  
  // Collect extPONumbers that need direct lookup (no listing purchase link)
  const salesNeedingDirectLookup: { extPONumber: string; quantity: number }[] = [];
  
  for (const sale of allSales) {
    // Track unique sale dates
    if (sale.saleDate) {
      const dateStr = new Date(sale.saleDate).toISOString().split('T')[0];
      uniqueDays.add(dateStr);
    }
    
    // Try to get cost from linked purchase (via listing)
    const purchase = sale.listing?.purchase;
    if (purchase && purchase.totalPrice && purchase.quantity && purchase.quantity > 0) {
      const costPerTicket = Number(purchase.totalPrice) / purchase.quantity;
      const saleCost = costPerTicket * sale.quantity;
      totalCost += saleCost;
    } else if (sale.extPONumber) {
      // No linked purchase - queue for direct lookup via extPONumber
      salesNeedingDirectLookup.push({ 
        extPONumber: sale.extPONumber, 
        quantity: sale.quantity 
      });
    }
  }
  
  // Batch lookup purchases by dashboardPoNumber for sales without listing links
  if (salesNeedingDirectLookup.length > 0) {
    const poNumbers = [...new Set(salesNeedingDirectLookup.map(s => s.extPONumber))];
    const directPurchases = await prisma.purchase.findMany({
      where: { dashboardPoNumber: { in: poNumbers } },
      select: { dashboardPoNumber: true, totalPrice: true, quantity: true },
    });
    
    // Create lookup map
    const purchaseByPO = new Map(
      directPurchases.map(p => [p.dashboardPoNumber, p])
    );
    
    // Calculate cost for sales matched directly to purchases
    for (const sale of salesNeedingDirectLookup) {
      const purchase = purchaseByPO.get(sale.extPONumber);
      if (purchase && purchase.totalPrice && purchase.quantity && purchase.quantity > 0) {
        const costPerTicket = Number(purchase.totalPrice) / purchase.quantity;
        const saleCost = costPerTicket * sale.quantity;
        totalCost += saleCost;
      }
    }
  }
  
  const totalProfit = totalRevenue - totalCost;
  const daysWithSales = uniqueDays.size || 1; // Avoid division by zero
  const avgProfitPerDay = totalProfit / daysWithSales;

  return {
    totalSales,
    pendingSales,
    completedSales,
    totalRevenue,
    totalCost,
    totalProfit,
    avgProfitPerDay,
    daysWithSales,
  };
}

/**
 * Get invoice statistics
 */
export async function getInvoiceStats(): Promise<InvoiceStats> {
  const [totalInvoices, paidInvoices, unpaidInvoices, aggregates] =
    await Promise.all([
      prisma.invoice.count({ where: { isCancelled: false } }),
      prisma.invoice.count({ where: { isPaid: true, isCancelled: false } }),
      prisma.invoice.count({ where: { isPaid: false, isCancelled: false } }),
      prisma.invoice.aggregate({
        where: { isCancelled: false },
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

  const unpaidAggregates = await prisma.invoice.aggregate({
    where: { isPaid: false, isCancelled: false },
    _sum: {
      totalAmount: true,
    },
  });

  return {
    totalInvoices,
    paidInvoices,
    unpaidInvoices,
    totalRevenue: Number(aggregates._sum.totalAmount || 0),
    totalUnpaid: Number(unpaidAggregates._sum.totalAmount || 0),
  };
}

// =============================================================================
// Exports
// =============================================================================

export const SalesSync = {
  syncSalesFromPos,
  syncInvoicesFromPos,
  syncAllFromPos,
  relinkUnlinkedSales,
  getSalesStats,
  getInvoiceStats,
};
