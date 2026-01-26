/**
 * Sales API Route
 * 
 * GET - List sales with filters and pagination
 * POST - Sync sales from TicketVault POS
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { SalesSync } from "@/lib/services/sales-sync";
import { Prisma } from "@prisma/client";
import { formatSSE, getStreamHeaders } from "@/lib/utils/streaming";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;
    
    // Filters
    const status = searchParams.get("status"); // "pending", "complete", "alert", "all"
    const search = searchParams.get("search");
    const invoiceNumber = searchParams.get("invoiceNumber");
    const hasListing = searchParams.get("hasListing"); // "true", "false"
    const dateRange = searchParams.get("dateRange"); // "all", "today", "week", "month", "quarter"
    const profitFilter = searchParams.get("profit"); // "all", "profitable", "breakeven", "loss"
    const eventFilter = searchParams.get("event"); // event name
    
    // Build where clause
    const where: Prisma.SaleWhereInput = {};
    
    // Status filter
    // Status 1 = Complete/Delivered
    // Status 40 = Alert (confirmed, awaiting delivery)
    // Status 20 = Pending (not confirmed)
    if (status === "pending") {
      where.status = 20;
    } else if (status === "alert") {
      where.status = 40;
    } else if (status === "complete") {
      where.OR = [
        { status: 1 },
        { isComplete: true },
      ];
    }
    
    // Search filter - search multiple fields
    if (search) {
      where.AND = [
        ...(where.AND as Prisma.SaleWhereInput[] || []),
        {
          OR: [
            { eventName: { contains: search, mode: "insensitive" } },
            { buyerEmail: { contains: search, mode: "insensitive" } },
            { buyerName: { contains: search, mode: "insensitive" } },
            { extOrderNumber: { contains: search, mode: "insensitive" } },
            { extPONumber: { contains: search, mode: "insensitive" } },
            { listing: { accountEmail: { contains: search, mode: "insensitive" } } },
            { listing: { extPONumber: { contains: search, mode: "insensitive" } } },
            { listing: { purchase: { dashboardPoNumber: { contains: search, mode: "insensitive" } } } },
          ],
        },
      ];
    }
    
    // Date range filter
    if (dateRange && dateRange !== "all") {
      const now = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 3);
          break;
        default:
          startDate = new Date(0); // Beginning of time
      }
      
      where.saleDate = { gte: startDate };
    }
    
    // Event filter
    if (eventFilter && eventFilter !== "all") {
      where.eventName = eventFilter;
    }
    
    if (invoiceNumber) {
      where.invoiceNumber = parseInt(invoiceNumber);
    }
    
    if (hasListing === "true") {
      where.listingId = { not: null };
    } else if (hasListing === "false") {
      where.listingId = null;
    }
    
    // Get sales with pagination
    const [rawSales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
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
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              isPaid: true,
              payoutStatus: true,
              totalAmount: true,
              fees: true,
            },
          },
        },
        orderBy: { saleDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);
    
    // For sales without listings, try to get purchase data directly via extPONumber
    const sales = await Promise.all(
      rawSales.map(async (sale) => {
        // If sale has listing with purchase, use that
        if (sale.listing?.purchase) {
          return sale;
        }
        
        // If sale has extPONumber but no listing, look up purchase directly
        if (sale.extPONumber && !sale.listing) {
          const purchase = await prisma.purchase.findFirst({
            where: { dashboardPoNumber: sale.extPONumber },
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
          });
          
          if (purchase) {
            // Create a synthetic listing object with the purchase data
            return {
              ...sale,
              listing: {
                id: null,
                extPONumber: sale.extPONumber,
                accountEmail: purchase.account?.email || null,
                cost: purchase.priceEach,
                purchaseId: purchase.id,
                purchase,
              },
            };
          }
        }
        
        return sale;
      })
    );
    
    // Get stats
    const stats = await SalesSync.getSalesStats();
    
    return NextResponse.json({
      success: true,
      sales,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Sales API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, streaming } = body;
    
    if (action === "sync" || !action) {
      // If streaming, return SSE stream
      if (streaming) {
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();

            controller.enqueue(encoder.encode(formatSSE({
              type: "start",
              total: 0,
              label: "Fetching sales from POS...",
            })));

            try {
              const result = await SalesSync.syncSalesFromPos();

              if (result.success) {
                controller.enqueue(encoder.encode(formatSSE({
                  type: "complete",
                  current: result.synced,
                  total: result.synced,
                  success: result.created + result.updated,
                  failed: 0,
                  message: `Synced ${result.synced} sales (${result.created} new, ${result.updated} updated, ${result.linked} linked)`,
                })));
              } else {
                controller.enqueue(encoder.encode(formatSSE({
                  type: "error",
                  message: result.error || "Sync failed",
                })));
              }
            } catch (error) {
              controller.enqueue(encoder.encode(formatSSE({
                type: "error",
                message: error instanceof Error ? error.message : "Sync failed",
              })));
            }

            controller.close();
          },
        });

        return new Response(stream, { headers: getStreamHeaders() });
      }

      // Non-streaming fallback
      const result = await SalesSync.syncSalesFromPos();
      
      const { success, error, ...restResult } = result;
      return NextResponse.json({
        success,
        message: success
          ? `Synced ${result.synced} sales (${result.created} new, ${result.updated} updated, ${result.linked} linked)`
          : error,
        ...restResult,
      });
    }
    
    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Sales API] Sync error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync sales" },
      { status: 500 }
    );
  }
}
