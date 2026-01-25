import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";

/**
 * POST /api/admin/bulk-delete
 * Bulk delete records based on filters
 * 
 * Body:
 * - table: "purchases" | "accounts" | "queuePositions" | "events"
 * - filters: object with filter criteria
 * - confirm: must be true
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, filters, confirm } = body;

    if (!confirm) {
      return NextResponse.json(
        { error: "Confirmation required", message: "Set confirm: true to proceed" },
        { status: 400 }
      );
    }

    if (!table) {
      return NextResponse.json(
        { error: "Table name required" },
        { status: 400 }
      );
    }

    let deletedCount = 0;

    switch (table) {
      case "purchases": {
        const where: Record<string, unknown> = {};
        
        if (filters?.status) {
          where.status = filters.status as PurchaseStatus;
        }
        if (filters?.eventId) {
          where.eventId = filters.eventId;
        }
        if (filters?.accountId) {
          where.accountId = filters.accountId;
        }
        if (filters?.errorCode) {
          where.errorCode = filters.errorCode;
        }
        if (filters?.beforeDate) {
          where.createdAt = { lt: new Date(filters.beforeDate) };
        }

        const result = await prisma.purchase.deleteMany({ where });
        deletedCount = result.count;
        break;
      }

      case "accounts": {
        const where: Record<string, unknown> = {};
        
        if (filters?.status) {
          where.status = filters.status;
        }
        if (filters?.hasCard !== undefined) {
          where.cards = filters.hasCard ? { some: { deletedAt: null } } : { none: {} };
        }

        const result = await prisma.account.deleteMany({ where });
        deletedCount = result.count;
        break;
      }

      case "queuePositions": {
        const where: Record<string, unknown> = {};
        
        if (filters?.eventId) {
          where.eventId = filters.eventId;
        }
        if (filters?.accountId) {
          where.accountId = filters.accountId;
        }
        if (filters?.beforeDate) {
          where.testedAt = { lt: new Date(filters.beforeDate) };
        }

        const result = await prisma.queuePosition.deleteMany({ where });
        deletedCount = result.count;
        break;
      }

      case "events": {
        const where: Record<string, unknown> = {};
        
        // Only allow deleting events with no purchases/queues if not forced
        if (!filters?.force) {
          where.purchases = { none: {} };
          where.queuePositions = { none: {} };
        }

        const result = await prisma.event.deleteMany({ where });
        deletedCount = result.count;
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown table: ${table}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      table,
      deleted: deletedCount,
      filters,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete records", details: String(error) },
      { status: 500 }
    );
  }
}
