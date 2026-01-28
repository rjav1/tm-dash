import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/checkout/jobs/[id]/link
 * 
 * Link an account and card to a job that was created by the Discord listener.
 * The listener creates jobs with raw data (email, event info) but no account_id or card_id.
 * This endpoint handles the linking using Prisma which properly generates IDs.
 * 
 * This is called by the checkout daemon when it finds a job with no card assigned.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get the job
    const job = await prisma.checkoutJob.findUnique({
      where: { id },
      include: {
        account: true,
        card: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // If job already has a card, nothing to do
    if (job.cardId) {
      return NextResponse.json({
        message: "Job already has a card linked",
        job: {
          id: job.id,
          accountId: job.accountId,
          cardId: job.cardId,
          cardLast4: job.card?.cardNumber?.slice(-4),
        },
      });
    }

    // No email means we can't link
    if (!job.accountEmail) {
      return NextResponse.json(
        { error: "Job has no account email - cannot link" },
        { status: 400 }
      );
    }

    // Get auto-link config
    const [autoLinkConfig, allowedCardTagsConfig] = await Promise.all([
      prisma.checkoutConfig.findUnique({ where: { key: "auto_link_cards" } }),
      prisma.checkoutConfig.findUnique({ where: { key: "allowed_card_tags" } }),
    ]);
    const autoLinkCards = autoLinkConfig?.value !== "false";
    
    // Parse allowed_card_tags - empty array means all cards allowed
    let allowedTags: string[] = [];
    try {
      allowedTags = allowedCardTagsConfig?.value ? JSON.parse(allowedCardTagsConfig.value) : [];
    } catch {
      allowedTags = [];
    }

    if (!autoLinkCards) {
      return NextResponse.json(
        { error: "Auto-linking is disabled in config" },
        { status: 400 }
      );
    }

    // Build card filter based on allowed_card_tags setting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseCardFilter: any = {
      deletedAt: null,
      checkoutStatus: "AVAILABLE",
    };
    if (allowedTags.length > 0) {
      baseCardFilter.tags = {
        some: { name: { in: allowedTags, mode: "insensitive" } },
      };
    }

    let accountId = job.accountId;
    let cardId: string | null = null;
    let cardLast4: string | null = null;

    // Step 1: Find or create account
    if (!accountId) {
      let account = await prisma.account.findUnique({
        where: { email: job.accountEmail.toLowerCase() },
        include: {
          cards: {
            where: baseCardFilter,
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });

      if (!account) {
        // Create account
        account = await prisma.account.create({
          data: {
            email: job.accountEmail.toLowerCase(),
            status: "ACTIVE",
          },
          include: {
            cards: {
              where: baseCardFilter,
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        });
      }

      accountId = account.id;

      // Check if account already has a card
      if (account.cards.length > 0) {
        const card = account.cards[0];
        cardId = card.id;
        cardLast4 = card.cardNumber.slice(-4);
      }
    } else {
      // Account exists, check for linked cards
      const existingCards = await prisma.card.findMany({
        where: {
          accountId: accountId,
          ...baseCardFilter,
        },
        orderBy: { createdAt: "asc" },
        take: 1,
      });

      if (existingCards.length > 0) {
        const card = existingCards[0];
        cardId = card.id;
        cardLast4 = card.cardNumber.slice(-4);
      }
    }

    // Step 2: If no card linked to account, find an unlinked card and link it
    if (!cardId) {
      const availableCard = await prisma.card.findFirst({
        where: {
          accountId: null,
          ...baseCardFilter,
        },
        orderBy: { createdAt: "asc" },
      });

      if (availableCard) {
        // Link the card to this account
        await prisma.card.update({
          where: { id: availableCard.id },
          data: { accountId: accountId },
        });

        cardId = availableCard.id;
        cardLast4 = availableCard.cardNumber.slice(-4);
      }
    }

    // Step 3: Update the job with account and card
    const updatedJob = await prisma.checkoutJob.update({
      where: { id },
      data: {
        accountId: accountId,
        cardId: cardId,
        cardLast4: cardLast4,
      },
    });

    return NextResponse.json({
      message: cardId ? "Successfully linked account and card" : "Account linked but no card available",
      job: {
        id: updatedJob.id,
        accountId: updatedJob.accountId,
        cardId: updatedJob.cardId,
        cardLast4: updatedJob.cardLast4,
      },
    });
  } catch (error) {
    console.error("Error linking job:", error);
    return NextResponse.json(
      { error: "Failed to link job", details: String(error) },
      { status: 500 }
    );
  }
}
