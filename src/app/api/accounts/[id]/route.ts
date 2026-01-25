import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { AccountStatus } from "@prisma/client";
import { calculatePercentile } from "@/lib/analytics";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        cards: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
        creationProxy: true,
        runtimeProxy: true,
        imapCredential: true,
        purchases: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            event: {
              select: { 
                id: true, 
                eventName: true, 
                tmEventId: true, 
                artistName: true,
                venue: true,
                eventDate: true,
                eventDateRaw: true,
              },
            },
            card: {
              select: { id: true, profileName: true },
            },
          },
        },
        queuePositions: {
          orderBy: { testedAt: "desc" },
          take: 50,
          include: {
            event: {
              select: { 
                id: true, 
                eventName: true, 
                tmEventId: true, 
                artistName: true,
                venue: true,
                eventDate: true,
                eventDateRaw: true,
              },
            },
          },
        },
        proxies: {
          include: {
            proxy: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Calculate percentiles for all queue positions (some may be cached in DB, others need calculation)
    const eventIds = [...new Set(account.queuePositions.map(q => q.eventId))];
    
    // Cache of all positions per event for percentile calculation
    const eventPositionsMap: Record<string, number[]> = {};
    
    for (const eventId of eventIds) {
      // Get all non-excluded positions for this event (same as Queue Analytics)
      const allPositions = await prisma.queuePosition.findMany({
        where: { eventId, excluded: false },
        select: { position: true },
        orderBy: { position: "asc" },
      });
      
      eventPositionsMap[eventId] = allPositions.map(p => p.position);
    }
    
    // Build queue positions with calculated/cached percentiles
    const queuePositionsWithPercentile = account.queuePositions.map(pos => {
      const sortedPositions = eventPositionsMap[pos.eventId] || [];
      const totalParticipants = sortedPositions.length;
      
      // Check if we need to calculate (missing from DB)
      const existingPercentile = (pos as { percentile?: number | null }).percentile;
      const existingTotal = (pos as { totalParticipants?: number | null }).totalParticipants;
      
      if (existingPercentile != null && existingTotal != null) {
        // Use cached values
        return {
          ...pos,
          percentile: existingPercentile,
          totalParticipants: existingTotal,
        };
      }
      
      // Calculate percentile
      if (totalParticipants > 0) {
        const percentile = Math.round(calculatePercentile(pos.position, sortedPositions));
        
        // Update in DB (fire and forget)
        prisma.queuePosition.update({
          where: { id: pos.id },
          data: { percentile, totalParticipants },
        }).catch((err) => console.error("Failed to update percentile:", err));
        
        return {
          ...pos,
          percentile,
          totalParticipants,
        };
      }
      
      return {
        ...pos,
        percentile: null,
        totalParticipants: 0,
      };
    });

    // Get available unlinked cards for linking dropdown (exclude deleted)
    const availableCards = await prisma.card.findMany({
      where: { 
        accountId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        profileName: true,
        cardType: true,
        cardNumber: true,
      },
      orderBy: { profileName: "asc" },
    });

    // Include currently linked cards in available options
    for (const card of account.cards) {
      availableCards.unshift({
        id: card.id,
        profileName: card.profileName,
        cardType: card.cardType,
        cardNumber: card.cardNumber,
      });
    }

    // Format cards for response with masked card numbers
    const formattedCards = account.cards.map(c => ({
      id: c.id,
      profileName: c.profileName,
      cardType: c.cardType,
      cardNumber: `****${c.cardNumber.slice(-4)}`,
      expMonth: c.expMonth,
      expYear: c.expYear,
      billingName: c.billingName,
    }));

    return NextResponse.json({ 
      account: {
        ...account,
        cards: formattedCards,
        queuePositions: queuePositionsWithPercentile,
      },
      availableCards: availableCards.map(c => ({
        ...c,
        cardNumber: `****${c.cardNumber.slice(-4)}`,
      })),
    });
  } catch (error) {
    console.error("Account fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch account", details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Verify account exists
    const existing = await prisma.account.findUnique({
      where: { id },
      include: { cards: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Handle email update (check uniqueness)
    if (body.email !== undefined && body.email !== existing.email) {
      const emailExists = await prisma.account.findUnique({
        where: { email: body.email },
      });
      if (emailExists) {
        return NextResponse.json(
          { error: `Email "${body.email}" is already in use` },
          { status: 400 }
        );
      }
      updateData.email = body.email;
    }

    // Handle status update
    if (body.status !== undefined) {
      if (!Object.values(AccountStatus).includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status: ${body.status}` },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }

    // Handle other fields
    if (body.password !== undefined) updateData.password = body.password || null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.imapProvider !== undefined) updateData.imapProvider = body.imapProvider || null;
    if (body.phoneNumber !== undefined) updateData.phoneNumber = body.phoneNumber || null;

    // Handle card linking (accounts can have multiple cards now)
    if (body.cardId !== undefined && body.cardId !== null && body.cardId !== "") {
      // Link to new card
      const card = await prisma.card.findUnique({
        where: { id: body.cardId },
      });

      if (!card) {
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
      }

      // Check if card is already linked to a different account
      if (card.accountId && card.accountId !== id) {
        return NextResponse.json(
          { error: "Card is already linked to another account" },
          { status: 400 }
        );
      }

      // Link the card to this account (accounts can have multiple cards)
      await prisma.card.update({
        where: { id: body.cardId },
        data: { accountId: id },
      });
    }

    const account = await prisma.account.update({
      where: { id },
      data: updateData,
      include: {
        cards: {
          where: { deletedAt: null },
          select: {
            id: true,
            profileName: true,
            cardType: true,
            cardNumber: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ 
      success: true,
      account: {
        ...account,
        cards: account.cards.map(c => ({
          ...c,
          cardNumber: `****${c.cardNumber.slice(-4)}`,
        })),
      },
    });
  } catch (error) {
    console.error("Account update error:", error);
    return NextResponse.json(
      { error: "Failed to update account", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get account info before deletion for response
    const account = await prisma.account.findUnique({
      where: { id },
      select: { email: true },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    await prisma.account.delete({
      where: { id },
    });

    return NextResponse.json({ 
      success: true,
      deletedEmail: account.email,
    });
  } catch (error) {
    console.error("Account delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete account", details: String(error) },
      { status: 500 }
    );
  }
}
