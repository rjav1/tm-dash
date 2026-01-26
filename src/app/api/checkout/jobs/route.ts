import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/checkout/jobs
 * Fetch paginated list of checkout jobs with filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const skip = (page - 1) * limit;
    const status = searchParams.get("status");
    const imported = searchParams.get("imported");
    const search = searchParams.get("search");
    const runId = searchParams.get("runId");

    // Build where clause
    const where: {
      status?: string | { in: string[] };
      imported?: boolean;
      runId?: string;
      OR?: Array<{ eventName?: { contains: string; mode: "insensitive" }; accountEmail?: { contains: string; mode: "insensitive" } }>;
    } = {};

    if (status) {
      // Support comma-separated statuses
      const statuses = status.split(",").map((s) => s.trim().toUpperCase());
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else {
        where.status = { in: statuses };
      }
    }

    if (imported !== null) {
      where.imported = imported === "true";
    }

    if (runId) {
      where.runId = runId;
    }

    if (search) {
      where.OR = [
        { eventName: { contains: search, mode: "insensitive" } },
        { accountEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get total count
    const total = await prisma.checkoutJob.count({ where });

    // Get jobs with relations
    const jobs = await prisma.checkoutJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        account: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
        card: {
          select: {
            id: true,
            cardNumber: true,
            cardType: true,
            billingName: true,
            checkoutStatus: true,
          },
        },
        run: {
          select: {
            id: true,
            workerId: true,
            status: true,
          },
        },
      },
    });

    // Transform jobs to add card last 4 for display
    const transformedJobs = jobs.map((job) => ({
      ...job,
      cardLast4: job.card?.cardNumber?.slice(-4) || job.cardLast4 || null,
    }));

    return NextResponse.json({
      jobs: transformedJobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching checkout jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch checkout jobs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/checkout/jobs
 * Create a new checkout job manually (for testing or manual triggers)
 * 
 * Body:
 * - targetUrl: string (required, the checkout URL)
 * - accountEmail: string (optional, email to use)
 * - eventName: string (optional)
 * - section: string (optional)
 * - row: string (optional)
 * - seats: string (optional)
 * - quantity: number (optional)
 * - priceEach: number (optional)
 * - expiresAt: number (optional, unix timestamp)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      targetUrl,
      accountEmail,
      eventName,
      tmEventId,
      venue,
      eventDate,
      section,
      row,
      seats,
      quantity = 1,
      priceEach,
      totalPrice,
      currency,
      expiresAt,
      discordMsgId,
    } = body;

    // Validate required fields
    if (!targetUrl || typeof targetUrl !== "string") {
      return NextResponse.json(
        { error: "Target URL is required" },
        { status: 400 }
      );
    }

    // Look up account if email provided, auto-link cards as needed
    let accountId: string | null = null;
    let cardId: string | null = null;
    let cardLast4: string | null = null;

    // Check if auto_link_cards is enabled (default: true)
    const autoLinkConfig = await prisma.checkoutConfig.findUnique({
      where: { key: "auto_link_cards" },
    });
    const autoLinkCards = autoLinkConfig?.value !== "false";

    if (accountEmail) {
      // Try to find existing account
      let account = await prisma.account.findUnique({
        where: { email: accountEmail.toLowerCase() },
        include: {
          cards: {
            where: {
              deletedAt: null,
              checkoutStatus: "AVAILABLE",
            },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });

      // If no account exists and auto-link is enabled, create one
      if (!account && autoLinkCards) {
        account = await prisma.account.create({
          data: {
            email: accountEmail.toLowerCase(),
            status: "ACTIVE",
          },
          include: {
            cards: {
              where: {
                deletedAt: null,
                checkoutStatus: "AVAILABLE",
              },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        });
      }

      if (account) {
        accountId = account.id;

        // If account has linked cards, use the first available one
        if (account.cards.length > 0) {
          const card = account.cards[0];
          cardId = card.id;
          cardLast4 = card.cardNumber.slice(-4);
        } else if (autoLinkCards) {
          // Account has no cards - find an unlinked available card and link it
          const availableCard = await prisma.card.findFirst({
            where: {
              accountId: null,
              checkoutStatus: "AVAILABLE",
              deletedAt: null,
            },
            orderBy: { createdAt: "asc" },
          });

          if (availableCard) {
            // Link the card to this account
            await prisma.card.update({
              where: { id: availableCard.id },
              data: { accountId: account.id },
            });

            cardId = availableCard.id;
            cardLast4 = availableCard.cardNumber.slice(-4);
          }
        }
      }
    } else if (autoLinkCards) {
      // No email provided - just find any available unlinked card
      const availableCard = await prisma.card.findFirst({
        where: {
          accountId: null,
          checkoutStatus: "AVAILABLE",
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
      });

      if (availableCard) {
        cardId = availableCard.id;
        cardLast4 = availableCard.cardNumber.slice(-4);
        // Note: card stays unlinked since we have no account
      }
    }

    // Create the checkout job
    const job = await prisma.checkoutJob.create({
      data: {
        targetUrl,
        discordMsgId: discordMsgId || null,
        status: "QUEUED",
        accountId,
        cardId,
        accountEmail: accountEmail?.toLowerCase() || null,
        cardLast4,
        eventName: eventName || null,
        tmEventId: tmEventId || null,
        venue: venue || null,
        eventDate: eventDate || null,
        section: section || null,
        row: row || null,
        seats: seats || null,
        quantity,
        priceEach: priceEach || null,
        totalPrice: totalPrice || null,
        currency: currency || null,
        expiresAt: expiresAt || null,
      },
      include: {
        account: {
          select: {
            id: true,
            email: true,
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
    });

    return NextResponse.json({
      success: true,
      job,
      message: "Checkout job created",
    });
  } catch (error) {
    console.error("Error creating checkout job:", error);
    return NextResponse.json(
      { error: "Failed to create checkout job" },
      { status: 500 }
    );
  }
}
