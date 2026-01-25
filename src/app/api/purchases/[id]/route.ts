import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";

/**
 * GET /api/purchases/[id]
 * Get a single purchase with all related data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        account: {
          include: {
            cards: {
              where: { deletedAt: null },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        event: true,
        card: true,
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    // Get all cards for linking options (include cards without accounts)
    const allCards = await prisma.card.findMany({
      select: {
        id: true,
        profileName: true,
        cardType: true,
        cardNumber: true,
        billingName: true,
        accountId: true,
        account: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get all events for linking options  
    const allEvents = await prisma.event.findMany({
      select: {
        id: true,
        tmEventId: true,
        eventName: true,
        eventDate: true,
        venue: true,
        getInPrice: true,
      },
      orderBy: { eventDate: "desc" },
    });
    
    // Get zone prices for the current event
    let eventZonePrices: Array<{zoneName: string, minPrice: number}> = [];
    if (purchase.eventId) {
      const zonePricesRaw: Array<{zone_name: string, min_price: number}> = await prisma.$queryRaw`
        SELECT zone_name, min_price FROM event_zone_prices WHERE event_id = ${purchase.eventId}
      `;
      eventZonePrices = zonePricesRaw.map(zp => ({
        zoneName: zp.zone_name,
        minPrice: Number(zp.min_price),
      }));
    }
    
    // Get price override fields using raw query
    const overrideFields: Array<{
      price_override_type: string | null;
      price_override_zone: string | null;
      price_override_value: number | null;
    }> = await prisma.$queryRaw`
      SELECT price_override_type, price_override_zone, price_override_value
      FROM purchases WHERE id = ${id}
    `;
    const overrideData = overrideFields[0] || {};

    // Get all accounts for linking options
    const allAccounts = await prisma.account.findMany({
      select: {
        id: true,
        email: true,
        status: true,
      },
      orderBy: { email: "asc" },
    });

    // Calculate TRUE unit cost: total price (with fees) / quantity
    const totalPrice = purchase.totalPrice ? Number(purchase.totalPrice) : 0;
    const trueUnitCost = purchase.quantity > 0 ? totalPrice / purchase.quantity : 0;

    return NextResponse.json({
      purchase: {
        ...purchase,
        priceEach: trueUnitCost, // Use TRUE unit cost (total / quantity)
        totalPrice,
        // Include price override fields
        priceOverrideType: overrideData.price_override_type || null,
        priceOverrideZone: overrideData.price_override_zone || null,
        priceOverrideValue: overrideData.price_override_value ? Number(overrideData.price_override_value) : null,
        // Enhance event with zone prices
        event: purchase.event ? {
          ...purchase.event,
          getInPrice: purchase.event.getInPrice ? Number(purchase.event.getInPrice) : null,
          zonePrices: eventZonePrices,
        } : null,
      },
      availableCards: allCards.map(c => ({
        id: c.id,
        label: `${c.profileName || c.billingName} - ${c.cardType} ****${c.cardNumber.slice(-4)}`,
        accountEmail: c.account?.email || "Unlinked",
      })),
      availableEvents: allEvents.map(e => {
        // Format the date for display
        let dateStr = "";
        if (e.eventDate) {
          const date = new Date(e.eventDate);
          dateStr = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }
        return {
          id: e.id,
          label: `${e.eventName} - ${e.venue || "Unknown venue"}${dateStr ? ` (${dateStr})` : ""}`,
          tmEventId: e.tmEventId,
          getInPrice: e.getInPrice ? Number(e.getInPrice) : null,
        };
      }),
      availableAccounts: allAccounts.map(a => ({
        id: a.id,
        email: a.email,
        status: a.status,
      })),
    });
  } catch (error) {
    console.error("Get purchase error:", error);
    return NextResponse.json(
      { error: "Failed to get purchase", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/purchases/[id]
 * Update purchase details including linking to card, event, account
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Verify purchase exists
    const existing = await prisma.purchase.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Link to card
    if (body.cardId !== undefined) {
      updateData.cardId = body.cardId || null;
    }

    // Link to event
    if (body.eventId !== undefined) {
      updateData.eventId = body.eventId || null;
    }

    // Link to account (requires moving the purchase)
    if (body.accountId !== undefined && body.accountId !== existing.accountId) {
      // Verify account exists
      const account = await prisma.account.findUnique({
        where: { id: body.accountId },
      });
      if (!account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      updateData.accountId = body.accountId;
    }

    // Update status
    if (body.status !== undefined) {
      const validStatuses = ["SUCCESS", "FAILED", "NEEDS_REVIEW"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updateData.status = body.status as PurchaseStatus;
    }

    // Update ticket details
    if (body.quantity !== undefined) updateData.quantity = body.quantity;
    if (body.totalPrice !== undefined) updateData.totalPrice = body.totalPrice;
    
    // Calculate priceEach from totalPrice and quantity (true unit cost with fees)
    const finalQuantity = body.quantity !== undefined ? body.quantity : existing.quantity;
    const finalTotalPrice = body.totalPrice !== undefined ? body.totalPrice : existing.totalPrice;
    if (finalQuantity > 0 && finalTotalPrice) {
      updateData.priceEach = Number(finalTotalPrice) / finalQuantity;
    }
    if (body.section !== undefined) updateData.section = body.section || null;
    if (body.row !== undefined) updateData.row = body.row || null;
    if (body.seats !== undefined) updateData.seats = body.seats || null;

    // Update error info
    if (body.errorCode !== undefined) updateData.errorCode = body.errorCode || null;
    if (body.errorMessage !== undefined) updateData.errorMessage = body.errorMessage || null;

    // Update URLs
    if (body.checkoutUrl !== undefined) updateData.checkoutUrl = body.checkoutUrl || null;
    if (body.confirmationUrl !== undefined) updateData.confirmationUrl = body.confirmationUrl || null;
    
    // Update price override fields
    if (body.priceOverrideType !== undefined) {
      updateData.priceOverrideType = body.priceOverrideType || null;
    }
    if (body.priceOverrideZone !== undefined) {
      updateData.priceOverrideZone = body.priceOverrideZone || null;
    }
    if (body.priceOverrideValue !== undefined) {
      updateData.priceOverrideValue = body.priceOverrideValue != null 
        ? parseFloat(body.priceOverrideValue) 
        : null;
    }

    const updated = await prisma.purchase.update({
      where: { id },
      data: updateData,
      include: {
        account: true,
        event: true,
        card: true,
      },
    });

    return NextResponse.json({
      success: true,
      purchase: {
        ...updated,
        priceEach: updated.priceEach ? Number(updated.priceEach) : null,
        totalPrice: updated.totalPrice ? Number(updated.totalPrice) : null,
      },
    });
  } catch (error) {
    console.error("Update purchase error:", error);
    return NextResponse.json(
      { error: "Failed to update purchase", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/purchases/[id]
 * Delete a purchase
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.purchase.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete purchase error:", error);
    return NextResponse.json(
      { error: "Failed to delete purchase", details: String(error) },
      { status: 500 }
    );
  }
}
