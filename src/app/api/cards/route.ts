import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * GET /api/cards
 * Fetch paginated list of card profiles with filtering and sorting
 * 
 * Query Parameters:
 * - search: Filter by profile name, billing name, card number, street, city, or linked account email
 * - linked: Filter by linkage status ("true" = linked, "false" = unlinked)
 * - checkoutStatus: Filter by checkout status (AVAILABLE, IN_USE, DECLINED, EXHAUSTED)
 * - cardType: Filter by card type (Visa, Mastercard, Amex, Discover)
 * - state: Filter by billing state (2-letter code)
 * - hasPurchases: Filter by purchase history ("true" = has purchases, "false" = no purchases)
 * - expiry: Filter by expiry status ("expired", "expiring_soon", "valid")
 * - tagId: Filter by card tag ID
 * - includeDeleted: Include soft-deleted cards ("true" to include)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - sortBy: Sort field (profileName, cardType, createdAt, checkoutStatus, purchaseCount, useCount, lastUsedAt)
 * - sortOrder: Sort direction (asc, desc)
 * 
 * Response:
 * - cards: Array of card objects with linked account info, purchase count, and checkout stats
 * - pagination: { page, limit, total, pages }
 * - stats: { total, linked, unlinked, deleted, available, declined }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const linked = searchParams.get("linked"); // "true", "false", or null for all
    const checkoutStatus = searchParams.get("checkoutStatus"); // AVAILABLE, IN_USE, DECLINED, EXHAUSTED
    const cardType = searchParams.get("cardType"); // Visa, Mastercard, Amex, Discover
    const state = searchParams.get("state"); // 2-letter state code
    const hasPurchases = searchParams.get("hasPurchases"); // "true", "false"
    const expiry = searchParams.get("expiry"); // "expired", "expiring_soon", "valid"
    const tagId = searchParams.get("tagId"); // Filter by card tag
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

    // Filter by checkout status
    if (checkoutStatus) {
      where.checkoutStatus = checkoutStatus;
    }

    // Filter by card type
    if (cardType) {
      where.cardType = { equals: cardType, mode: "insensitive" };
    }

    // Filter by state
    if (state) {
      where.billingState = { equals: state, mode: "insensitive" };
    }

    // Filter by expiry
    if (expiry) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-12
      
      // Calculate 3 months from now
      const threeMonthsFromNow = new Date(now);
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
      const futureYear = threeMonthsFromNow.getFullYear();
      const futureMonth = threeMonthsFromNow.getMonth() + 1;

      if (expiry === "expired") {
        // Card is expired if expYear < currentYear OR (expYear == currentYear AND expMonth < currentMonth)
        where.OR = [
          { expYear: { lt: String(currentYear) } },
          { 
            AND: [
              { expYear: String(currentYear) },
              { expMonth: { lt: String(currentMonth).padStart(2, "0") } }
            ]
          }
        ];
      } else if (expiry === "expiring_soon") {
        // Expires within 3 months but not expired yet
        where.AND = [
          // Not expired
          {
            OR: [
              { expYear: { gt: String(currentYear) } },
              {
                AND: [
                  { expYear: String(currentYear) },
                  { expMonth: { gte: String(currentMonth).padStart(2, "0") } }
                ]
              }
            ]
          },
          // But expires before 3 months from now
          {
            OR: [
              { expYear: { lt: String(futureYear) } },
              {
                AND: [
                  { expYear: String(futureYear) },
                  { expMonth: { lte: String(futureMonth).padStart(2, "0") } }
                ]
              }
            ]
          }
        ];
      } else if (expiry === "valid") {
        // Valid for 3+ months
        where.OR = [
          { expYear: { gt: String(futureYear) } },
          {
            AND: [
              { expYear: String(futureYear) },
              { expMonth: { gt: String(futureMonth).padStart(2, "0") } }
            ]
          }
        ];
      }
    }

    // Filter by purchase history
    if (hasPurchases === "true") {
      where.purchases = { some: {} };
    } else if (hasPurchases === "false") {
      where.purchases = { none: {} };
    }

    // Filter by tag
    if (tagId) {
      where.tags = { some: { id: tagId } };
    }

    // Search - include street and city
    if (search) {
      const searchConditions: Prisma.CardWhereInput[] = [
        { profileName: { contains: search, mode: "insensitive" } },
        { billingName: { contains: search, mode: "insensitive" } },
        { cardNumber: { contains: search } },
        { billingAddress: { contains: search, mode: "insensitive" } },
        { billingCity: { contains: search, mode: "insensitive" } },
        { account: { email: { contains: search, mode: "insensitive" } } },
      ];
      
      // Merge with existing OR/AND conditions if any from expiry filter
      if (where.OR && !where.AND) {
        // expiry filter used OR, wrap it
        const existingOr = where.OR;
        delete where.OR;
        where.AND = [
          { OR: existingOr },
          { OR: searchConditions }
        ];
      } else if (where.AND) {
        // expiry filter used AND, add search as another condition
        (where.AND as Prisma.CardWhereInput[]).push({ OR: searchConditions });
      } else {
        where.OR = searchConditions;
      }
    }

    // Build orderBy
    const validSortFields = ["profileName", "cardType", "createdAt", "checkoutStatus", "useCount", "lastUsedAt"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";
    const orderBy: Prisma.CardOrderByWithRelationInput = { [orderField]: orderDir };

    // Stats should count only active (non-deleted) cards
    const activeCardFilter = { deletedAt: null };
    const [cards, filteredTotal, totalCards, linkedCards, unlinkedCards, deletedCards, availableCards, declinedCards] = await Promise.all([
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
          tags: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          _count: {
            select: {
              purchases: true,
              checkoutJobs: true,
            },
          },
        },
      }),
      prisma.card.count({ where }),
      prisma.card.count({ where: activeCardFilter }),
      prisma.card.count({ where: { ...activeCardFilter, accountId: { not: null } } }),
      prisma.card.count({ where: { ...activeCardFilter, accountId: null } }),
      prisma.card.count({ where: { deletedAt: { not: null } } }),
      prisma.card.count({ where: { ...activeCardFilter, checkoutStatus: "AVAILABLE" } }),
      prisma.card.count({ where: { ...activeCardFilter, checkoutStatus: "DECLINED" } }),
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
        tags: card.tags,
        purchaseCount: card._count.purchases,
        checkoutJobCount: card._count.checkoutJobs,
        isLinked: card.accountId !== null,
        isDeleted: card.deletedAt !== null,
        // Checkout tracking fields
        checkoutStatus: card.checkoutStatus,
        useCount: card.useCount,
        lastUsedAt: card.lastUsedAt,
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
        available: availableCards,
        declined: declinedCards,
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
 * Bulk operations on cards
 * 
 * Request Body:
 * - cardIds: Array of card IDs to update
 * - action: "delete" | "restore" | "addTag" | "removeTag"
 * - tagId: Required for addTag/removeTag actions
 * 
 * Response:
 * - success: boolean
 * - action: The action performed
 * - updated: Number of cards updated
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardIds, action, tagId } = body;

    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return NextResponse.json({ error: "cardIds array required" }, { status: 400 });
    }

    if (!["delete", "restore", "addTag", "removeTag"].includes(action)) {
      return NextResponse.json({ error: "action must be 'delete', 'restore', 'addTag', or 'removeTag'" }, { status: 400 });
    }

    // Handle tag operations
    if (action === "addTag" || action === "removeTag") {
      if (!tagId) {
        return NextResponse.json({ error: "tagId required for tag operations" }, { status: 400 });
      }

      // Verify tag exists
      const tag = await prisma.cardTag.findUnique({ where: { id: tagId } });
      if (!tag) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }

      // Update each card's tags
      let updated = 0;
      for (const cardId of cardIds) {
        try {
          if (action === "addTag") {
            await prisma.card.update({
              where: { id: cardId },
              data: {
                tags: { connect: { id: tagId } },
              },
            });
          } else {
            await prisma.card.update({
              where: { id: cardId },
              data: {
                tags: { disconnect: { id: tagId } },
              },
            });
          }
          updated++;
        } catch {
          // Skip cards that don't exist or already have/don't have the tag
        }
      }

      return NextResponse.json({
        success: true,
        action,
        tagName: tag.name,
        updated,
      });
    }

    // Handle delete/restore
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
