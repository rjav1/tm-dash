import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { AccountStatus, Prisma } from "@prisma/client";

/**
 * GET /api/accounts
 * Fetch paginated list of accounts with filtering and sorting
 * 
 * Query Parameters:
 * - search: Filter by email (case-insensitive partial match)
 * - status: Filter by account status (ACTIVE, BANNED, SUSPENDED, INACTIVE, PENDING)
 * - hasCard: Filter by card linkage ("true" = has cards, "false" = no cards)
 * - hasPurchases: Filter by successful purchases ("true" = has purchases)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - sortBy: Sort field (email, status, createdAt, imapProvider, purchases, successRate)
 * - sortOrder: Sort direction (asc, desc)
 * 
 * Response:
 * - accounts: Array of account objects with stats and linked cards
 * - pagination: { page, limit, total, pages }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const hasCard = searchParams.get("hasCard");
    const hasPurchases = searchParams.get("hasPurchases");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const skip = (page - 1) * limit;
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build where clause
    const where: Prisma.AccountWhereInput = {};

    if (search) {
      where.email = { contains: search, mode: "insensitive" };
    }

    if (status && Object.values(AccountStatus).includes(status as AccountStatus)) {
      where.status = status as AccountStatus;
    }

    if (hasCard === "true") {
      where.cards = { some: {} };
    } else if (hasCard === "false") {
      where.cards = { none: {} };
    }

    // Filter by successful purchases
    if (hasPurchases === "true") {
      where.purchases = {
        some: {
          status: "SUCCESS"
        }
      };
    } else if (hasPurchases === "false") {
      where.purchases = {
        none: {
          status: "SUCCESS"
        }
      };
    }

    // Filter by POS import status
    const posImported = searchParams.get("posImported");
    if (posImported === "true") {
      where.posAccountId = { not: null };
    } else if (posImported === "false") {
      where.posAccountId = null;
    }

    // Build orderBy - only for DB-sortable fields
    const dbSortFields = ["email", "status", "createdAt", "imapProvider"];
    const computedSortFields = ["purchases", "successRate"];
    const isComputedSort = computedSortFields.includes(sortBy);
    const orderField = dbSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";
    const orderBy: Prisma.AccountOrderByWithRelationInput = isComputedSort 
      ? { createdAt: "desc" }  // Default sort for computed fields
      : { [orderField]: orderDir };

    // Get accounts with related data
    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          cards: {
            where: { deletedAt: null },
            select: {
              id: true,
              cardType: true,
              cardNumber: true,
              profileName: true,
            },
            orderBy: { createdAt: "asc" },
          },
          _count: {
            select: {
              purchases: true,
              queuePositions: true,
            },
          },
        },
      }),
      prisma.account.count({ where }),
    ]);

    // Get latest queue position for each account
    const accountIds = accounts.map((a) => a.id);
    const latestQueues = await prisma.queuePosition.findMany({
      where: { accountId: { in: accountIds } },
      orderBy: { testedAt: "desc" },
      distinct: ["accountId"],
      select: {
        accountId: true,
        position: true,
        testedAt: true,
        event: {
          select: { eventName: true },
        },
      },
    });

    // Get success rates for each account
    const purchaseStats = await prisma.purchase.groupBy({
      by: ["accountId", "status"],
      where: { accountId: { in: accountIds } },
      _count: true,
    });

    // Map data
    const queueMap = new Map(latestQueues.map((q) => [q.accountId, q]));
    const statsMap = new Map<string, { success: number; total: number }>();
    
    for (const stat of purchaseStats) {
      const existing = statsMap.get(stat.accountId) || { success: 0, total: 0 };
      existing.total += stat._count;
      if (stat.status === "SUCCESS") {
        existing.success += stat._count;
      }
      statsMap.set(stat.accountId, existing);
    }

    let formattedAccounts = accounts.map((account) => {
      const latestQueue = queueMap.get(account.id);
      const purchaseStat = statsMap.get(account.id);

      return {
        id: account.id,
        email: account.email,
        password: account.password || null,
        status: account.status,
        hasPassword: !!account.password,
        imapProvider: account.imapProvider,
        createdAt: account.createdAt,
        // POS import status
        posAccountId: account.posAccountId,
        posImportedAt: account.posImportedAt,
        cards: account.cards.map(c => ({
          id: c.id,
          type: c.cardType,
          last4: c.cardNumber.slice(-4),
          profileName: c.profileName,
        })),
        stats: {
          purchases: account._count.purchases,
          queueTests: account._count.queuePositions,
          successRate: purchaseStat
            ? Math.round((purchaseStat.success / purchaseStat.total) * 100)
            : null,
        },
        latestQueue: latestQueue
          ? {
              position: latestQueue.position,
              event: latestQueue.event.eventName,
              testedAt: latestQueue.testedAt,
            }
          : null,
      };
    });

    // Sort by computed fields if needed
    if (isComputedSort) {
      formattedAccounts = formattedAccounts.sort((a, b) => {
        let aVal: number, bVal: number;
        
        if (sortBy === "purchases") {
          aVal = a.stats.purchases;
          bVal = b.stats.purchases;
        } else if (sortBy === "successRate") {
          aVal = a.stats.successRate ?? -1;
          bVal = b.stats.successRate ?? -1;
        } else {
          return 0;
        }

        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return NextResponse.json({
      accounts: formattedAccounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Accounts fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
