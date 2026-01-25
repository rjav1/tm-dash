/**
 * Invoices API Route
 * 
 * GET - List invoices with filters and pagination
 * POST - Sync invoices from TicketVault POS
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { SalesSync } from "@/lib/services/sales-sync";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;
    
    // Filters
    const paidStatus = searchParams.get("paid"); // "true", "false", "all"
    const search = searchParams.get("search");
    const includeCancelled = searchParams.get("includeCancelled") === "true";
    const payoutFilter = searchParams.get("payout"); // "pending", "processing", "paid", "all"
    
    // Build where clause
    const where: Prisma.InvoiceWhereInput = {};
    
    if (!includeCancelled) {
      where.isCancelled = false;
    }
    
    if (paidStatus === "true") {
      where.isPaid = true;
    } else if (paidStatus === "false") {
      where.isPaid = false;
    }
    
    // Payout status filter
    if (payoutFilter && payoutFilter !== "all") {
      where.payoutStatus = { contains: payoutFilter, mode: "insensitive" };
    }
    
    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: "insensitive" } },
        { clientEmail: { contains: search, mode: "insensitive" } },
        { eventName: { contains: search, mode: "insensitive" } },
        { extPONumber: { contains: search, mode: "insensitive" } },
      ];
      // Also try to match invoice number if search is numeric
      const numericSearch = parseInt(search);
      if (!isNaN(numericSearch)) {
        where.OR.push({ invoiceNumber: numericSearch });
      }
    }
    
    // Get invoices with pagination
    const [rawInvoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          sales: {
            select: {
              id: true,
              ticketGroupId: true,
              quantity: true,
              salePrice: true,
              cost: true,
              section: true,
              row: true,
              seats: true,
              eventName: true,
              eventDateTime: true,
              venueName: true,
              buyerEmail: true,
              buyerName: true,
              extPONumber: true, // PO number from sale API
              eventId: true,     // For ticket-based PO lookup
              listingId: true,
              listing: {
                select: {
                  id: true,
                  extPONumber: true,
                  accountEmail: true,
                  cost: true,
                  purchaseId: true,
                  purchase: {
                    select: {
                      id: true,
                      dashboardPoNumber: true,
                      totalPrice: true,
                      priceEach: true,
                      cardId: true,
                      card: {
                        select: {
                          id: true,
                          cardNumber: true,
                          cardType: true,
                        },
                      },
                      account: {
                        select: {
                          id: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              },
              // Include tickets for PO derivation chain
              tickets: {
                select: {
                  id: true,
                  purchaseId: true,
                  purchase: {
                    select: {
                      id: true,
                      dashboardPoNumber: true,
                      account: {
                        select: {
                          id: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
                take: 1, // Just need one ticket to get purchase info
              },
            },
          },
        },
        orderBy: { invoiceDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);
    
    // For sales without a listing, try to find listing by ticketGroupId
    // Also derive PO number from ticket chain if needed
    const invoices = await Promise.all(
      rawInvoices.map(async (invoice) => {
        const salesWithListings = await Promise.all(
          invoice.sales.map(async (sale) => {
            // If sale already has a listing with purchase info, return as-is
            if (sale.listing?.purchase) {
              // Add derived PO number for convenience
              const derivedPoNumber = 
                sale.extPONumber || 
                sale.listing.extPONumber || 
                sale.listing.purchase.dashboardPoNumber || 
                null;
              return { ...sale, derivedPoNumber };
            }
            
            // Try to find listing by ticketGroupId
            let listing = sale.listing;
            if (!listing) {
              listing = await prisma.listing.findUnique({
                where: { ticketGroupId: sale.ticketGroupId },
                select: {
                  id: true,
                  extPONumber: true,
                  accountEmail: true,
                  cost: true,
                  purchaseId: true,
                  purchase: {
                    select: {
                      id: true,
                      dashboardPoNumber: true,
                      totalPrice: true,
                      priceEach: true,
                      cardId: true,
                      card: {
                        select: {
                          id: true,
                          cardNumber: true,
                          cardType: true,
                        },
                      },
                      account: {
                        select: {
                          id: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              });
            }
            
            // Derive PO number from multiple sources
            let derivedPoNumber = sale.extPONumber || null;
            
            if (!derivedPoNumber && listing?.extPONumber) {
              derivedPoNumber = listing.extPONumber;
            }
            
            if (!derivedPoNumber && listing?.purchase?.dashboardPoNumber) {
              derivedPoNumber = listing.purchase.dashboardPoNumber;
            }
            
            // If still no PO and we have tickets, try ticket -> purchase chain
            if (!derivedPoNumber && sale.tickets?.length > 0) {
              const ticket = sale.tickets[0];
              if (ticket.purchase?.dashboardPoNumber) {
                derivedPoNumber = ticket.purchase.dashboardPoNumber;
              }
            }
            
            return {
              ...sale,
              listing: listing || null,
              derivedPoNumber,
            };
          })
        );
        
        return {
          ...invoice,
          sales: salesWithListings,
        };
      })
    );
    
    // Get stats
    const stats = await SalesSync.getInvoiceStats();
    
    return NextResponse.json({
      success: true,
      invoices,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Invoices API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;
    
    if (action === "sync" || !action) {
      // Sync invoices from POS
      const result = await SalesSync.syncInvoicesFromPos();
      
      return NextResponse.json({
        success: result.success,
        message: result.success
          ? `Synced ${result.synced} invoices (${result.created} new, ${result.updated} updated)`
          : result.error,
        ...result,
      });
    }
    
    if (action === "syncAll") {
      // Sync both sales and invoices
      const result = await SalesSync.syncAllFromPos();
      
      return NextResponse.json({
        success: result.sales.success && result.invoices.success,
        message: `Synced ${result.sales.synced} sales and ${result.invoices.synced} invoices`,
        sales: result.sales,
        invoices: result.invoices,
      });
    }
    
    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Invoices API] Sync error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync invoices" },
      { status: 500 }
    );
  }
}
