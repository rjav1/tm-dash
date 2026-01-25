import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/cards/[id]
 * Get a single card with all details and linking options
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
        purchases: {
          select: {
            id: true,
            externalJobId: true,
            status: true,
            totalPrice: true,
            event: {
              select: {
                id: true,
                eventName: true,
                artistName: true,
              },
            },
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Get all accounts for linking (accounts can have multiple cards)
    const availableAccounts = await prisma.account.findMany({
      select: {
        id: true,
        email: true,
        status: true,
      },
      orderBy: { email: "asc" },
    });

    return NextResponse.json({
      card: {
        id: card.id,
        profileName: card.profileName,
        cardType: card.cardType,
        cardNumber: card.cardNumber,
        expMonth: card.expMonth,
        expYear: card.expYear,
        cvv: card.cvv,
        billingName: card.billingName,
        billingPhone: card.billingPhone,
        billingAddress: card.billingAddress,
        billingZip: card.billingZip,
        billingCity: card.billingCity,
        billingState: card.billingState,
        account: card.account,
        purchases: card.purchases.map((p) => ({
          ...p,
          totalPrice: p.totalPrice ? Number(p.totalPrice) : null,
        })),
        isLinked: card.accountId !== null,
      },
      availableAccounts,
    });
  } catch (error) {
    console.error("Get card error:", error);
    return NextResponse.json(
      { error: "Failed to get card", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/cards/[id]
 * Update card details and linking
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Verify card exists
    const existing = await prisma.card.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Handle account linking/unlinking
    if (body.accountId !== undefined) {
      if (body.accountId === null || body.accountId === "") {
        // Unlink from account
        updateData.accountId = null;
      } else {
        // Check if account exists (accounts can have multiple cards)
        const account = await prisma.account.findUnique({
          where: { id: body.accountId },
        });

        if (!account) {
          return NextResponse.json({ error: "Account not found" }, { status: 404 });
        }

        updateData.accountId = body.accountId;
      }
    }

    // Update profile name (check uniqueness)
    if (body.profileName !== undefined && body.profileName !== existing.profileName) {
      const existingProfile = await prisma.card.findUnique({
        where: { profileName: body.profileName },
      });
      if (existingProfile) {
        return NextResponse.json(
          { error: `Profile name "${body.profileName}" already exists` },
          { status: 400 }
        );
      }
      updateData.profileName = body.profileName;
    }

    // Update other fields
    if (body.cardType !== undefined) updateData.cardType = body.cardType;
    if (body.cardNumber !== undefined) {
      // Check uniqueness
      const existingCard = await prisma.card.findUnique({
        where: { cardNumber: body.cardNumber },
      });
      if (existingCard && existingCard.id !== id) {
        return NextResponse.json(
          { error: "Card number already exists" },
          { status: 400 }
        );
      }
      updateData.cardNumber = body.cardNumber;
    }
    if (body.expMonth !== undefined) updateData.expMonth = body.expMonth;
    if (body.expYear !== undefined) updateData.expYear = body.expYear;
    if (body.cvv !== undefined) updateData.cvv = body.cvv;
    if (body.billingName !== undefined) updateData.billingName = body.billingName;
    if (body.billingPhone !== undefined) updateData.billingPhone = body.billingPhone || null;
    if (body.billingAddress !== undefined) updateData.billingAddress = body.billingAddress;
    if (body.billingZip !== undefined) updateData.billingZip = body.billingZip;
    if (body.billingCity !== undefined) updateData.billingCity = body.billingCity;
    if (body.billingState !== undefined) updateData.billingState = body.billingState;

    const updated = await prisma.card.update({
      where: { id },
      data: updateData,
      include: {
        account: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      card: {
        ...updated,
        isLinked: updated.accountId !== null,
      },
    });
  } catch (error) {
    console.error("Update card error:", error);
    return NextResponse.json(
      { error: "Failed to update card", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cards/[id]
 * Soft delete a card (mark as deleted, but keep in DB with purchases linked)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if card exists
    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Soft delete: mark as deleted but keep in DB (purchases remain linked)
    await prisma.card.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      deletedProfileName: card.profileName,
      purchasesLinked: card._count.purchases,
    });
  } catch (error) {
    console.error("Delete card error:", error);
    return NextResponse.json(
      { error: "Failed to delete card", details: String(error) },
      { status: 500 }
    );
  }
}
