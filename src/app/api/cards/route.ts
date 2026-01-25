import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * GET /api/cards
 * Fetch paginated list of card profiles with filtering and sorting
 * 
 * Query Parameters:
 * - search: Filter by profile name, billing name, card number, or linked account email
 * - linked: Filter by linkage status ("true" = linked, "false" = unlinked)
 * - includeDeleted: Include soft-deleted cards ("true" to include)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - sortBy: Sort field (profileName, cardType, billingName, createdAt, expYear)
 * - sortOrder: Sort direction (asc, desc)
 * 
 * Response:
 * - cards: Array of card objects with linked account info and purchase count
 * - pagination: { page, limit, total, pages }
 * - stats: { total, linked, unlinked, deleted }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const linked = searchParams.get("linked"); // "true", "false", or null for all
    const includeDeleted = searchParams.get("includeDeleted") === "true"; // Show soft-deleted cards
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause using Prisma types
    const where: Prisma.CardWhereInput = {};

    // Filter out deleted cards by default
    if (!includeDeleted) {
      where.deletedAt = null;
    }

    // Filter by linked status
    if (linked === "true") {
      where.accountId = { not: null };
    } else if (linked === "false") {
      where.accountId = null;
    }

    // Search
    if (search) {
      where.OR = [
        { profileName: { contains: search, mode: "insensitive" } },
        { billingName: { contains: search, mode: "insensitive" } },
        { cardNumber: { contains: search } },
        { account: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Build orderBy
    const validSortFields = ["profileName", "cardType", "billingName", "createdAt", "expYear"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";
    const orderBy: Prisma.CardOrderByWithRelationInput = { [orderField]: orderDir };

    // Stats should count only active (non-deleted) cards
    const activeCardFilter = { deletedAt: null };
    const [cards, filteredTotal, totalCards, linkedCards, unlinkedCards, deletedCards] = await Promise.all([
      prisma.card.findMany({
        where,
        orderBy,
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
          _count: {
            select: {
              purchases: true,
            },
          },
        },
      }),
      prisma.card.count({ where }),
      prisma.card.count({ where: activeCardFilter }),
      prisma.card.count({ where: { ...activeCardFilter, accountId: { not: null } } }),
      prisma.card.count({ where: { ...activeCardFilter, accountId: null } }),
      prisma.card.count({ where: { deletedAt: { not: null } } }),
    ]);

    return NextResponse.json({
      cards: cards.map((card) => ({
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
        deletedAt: card.deletedAt,
        account: card.account,
        purchaseCount: card._count.purchases,
        isLinked: card.accountId !== null,
        isDeleted: card.deletedAt !== null,
      })),
      pagination: {
        page,
        limit,
        total: filteredTotal,
        pages: Math.ceil(filteredTotal / limit),
      },
      stats: {
        total: totalCards,
        linked: linkedCards,
        unlinked: unlinkedCards,
        deleted: deletedCards,
      },
    });
  } catch (error) {
    console.error("Cards fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cards", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/cards
 * Bulk soft delete or restore cards
 * 
 * Request Body:
 * - cardIds: Array of card IDs to update
 * - action: "delete" (soft delete) or "restore" (undelete)
 * 
 * Response:
 * - success: boolean
 * - action: The action performed
 * - updated: Number of cards updated
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardIds, action } = body;

    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return NextResponse.json({ error: "cardIds array required" }, { status: 400 });
    }

    if (!["delete", "restore"].includes(action)) {
      return NextResponse.json({ error: "action must be 'delete' or 'restore'" }, { status: 400 });
    }

    const updateData = action === "delete" 
      ? { deletedAt: new Date() }
      : { deletedAt: null };

    const result = await prisma.card.updateMany({
      where: { id: { in: cardIds } },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      action,
      updated: result.count,
    });
  } catch (error) {
    console.error("Card update error:", error);
    return NextResponse.json(
      { error: "Failed to update cards", details: String(error) },
      { status: 500 }
    );
  }
}
