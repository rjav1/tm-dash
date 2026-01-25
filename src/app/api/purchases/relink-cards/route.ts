import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/purchases/relink-cards
 * Re-link purchases to cards based on stored cardLast4 field
 * 
 * RULES (conservative - avoid wrong associations):
 * 1. Must have cardLast4 stored on the purchase
 * 2. Must find exactly ONE card matching that last 4 on the SAME account
 * 3. If multiple cards match or no cards match, skip (needs manual review)
 */
export async function POST() {
  try {
    // Get all purchases without cards that have cardLast4 stored
    const purchases = await prisma.purchase.findMany({
      where: {
        cardId: null,
      },
      select: {
        id: true,
        externalJobId: true,
        accountId: true,
        cardLast4: true,
        status: true,
      },
    });

    // Get all cards for matching
    const cards = await prisma.card.findMany({
      select: {
        id: true,
        cardNumber: true,
        accountId: true,
      },
    });

    let linked = 0;
    let noCardLast4 = 0;
    let noMatchingCard = 0;
    let multipleMatches = 0;
    let noAccountCards = 0;

    for (const purchase of purchases) {
      // Skip if no cardLast4 stored
      if (!purchase.cardLast4) {
        noCardLast4++;
        continue;
      }

      // Find cards for the same account that match the last 4 digits
      const matchingCards = cards.filter(c => 
        c.accountId === purchase.accountId && 
        c.cardNumber.endsWith(purchase.cardLast4!)
      );

      if (matchingCards.length === 1) {
        // Exactly one match - safe to link
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { cardId: matchingCards[0].id },
        });
        linked++;
      } else if (matchingCards.length > 1) {
        // Multiple cards match - needs manual review
        multipleMatches++;
      } else {
        // No matching cards for this account with this last 4
        // Check if account has any cards at all
        const accountCards = cards.filter(c => c.accountId === purchase.accountId);
        if (accountCards.length === 0) {
          noAccountCards++;
        } else {
          noMatchingCard++;
        }
      }
    }

    const notLinked = noCardLast4 + noMatchingCard + multipleMatches + noAccountCards;

    return NextResponse.json({
      success: true,
      purchasesWithoutCards: purchases.length,
      linked,
      notLinked,
      breakdown: {
        noCardLast4,       // No cardLast4 stored - can't match
        noMatchingCard,    // Has cardLast4 but no card in account matches
        multipleMatches,   // Multiple cards match - needs manual selection
        noAccountCards,    // Account has no cards at all
      },
      message: linked > 0 
        ? `Linked ${linked} purchases to cards. ${notLinked} need manual review.`
        : `No purchases could be auto-linked. ${notLinked} need manual review.`,
    });
  } catch (error) {
    console.error("Relink cards error:", error);
    return NextResponse.json(
      { error: "Failed to relink cards", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/purchases/relink-cards
 * Get detailed stats about purchases that need card linking
 */
export async function GET() {
  try {
    // Get counts by status
    const [withoutCards, withCards, total] = await Promise.all([
      prisma.purchase.count({ where: { cardId: null } }),
      prisma.purchase.count({ where: { cardId: { not: null } } }),
      prisma.purchase.count(),
    ]);

    // Break down unlinked by status
    const [unlinkedSuccess, unlinkedFailed] = await Promise.all([
      prisma.purchase.count({ where: { cardId: null, status: "SUCCESS" } }),
      prisma.purchase.count({ where: { cardId: null, status: "FAILED" } }),
    ]);

    // Check how many have cardLast4 stored
    const withCardLast4 = await prisma.purchase.count({ 
      where: { 
        cardId: null, 
        cardLast4: { not: null } 
      } 
    });

    return NextResponse.json({
      total,
      withCards,
      withoutCards,
      breakdown: {
        unlinkedSuccess,   // Successful purchases without cards (needs attention!)
        unlinkedFailed,    // Failed purchases without cards (less critical)
        withCardLast4,     // Can potentially be re-linked
        withoutCardLast4: withoutCards - withCardLast4, // Need manual entry
      },
      percentLinked: total > 0 ? Math.round((withCards / total) * 100) : 0,
    });
  } catch (error) {
    console.error("Get relink stats error:", error);
    return NextResponse.json(
      { error: "Failed to get stats", details: String(error) },
      { status: 500 }
    );
  }
}
