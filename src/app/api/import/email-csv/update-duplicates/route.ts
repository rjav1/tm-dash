import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface DuplicateUpdate {
  purchaseId: string;
  updates: {
    quantity?: number;
    totalPrice?: number;
    section?: string;
    row?: string;
    seats?: string;
  };
}

interface UpdateRequest {
  updates: DuplicateUpdate[];
}

/**
 * POST /api/import/email-csv/update-duplicates
 * Update existing purchases with new data from CSV import
 */
export async function POST(request: NextRequest) {
  try {
    const body: UpdateRequest = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    let updatedCount = 0;
    const errors: { purchaseId: string; error: string }[] = [];

    for (const update of updates) {
      try {
        // Verify purchase exists
        const existing = await prisma.purchase.findUnique({
          where: { id: update.purchaseId },
        });

        if (!existing) {
          errors.push({
            purchaseId: update.purchaseId,
            error: "Purchase not found",
          });
          continue;
        }

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (update.updates.quantity !== undefined) {
          updateData.quantity = update.updates.quantity;
        }

        if (update.updates.totalPrice !== undefined) {
          updateData.totalPrice = update.updates.totalPrice;
          // Recalculate price each
          if (update.updates.quantity && update.updates.quantity > 0) {
            updateData.priceEach = update.updates.totalPrice / update.updates.quantity;
          } else if (existing.quantity > 0) {
            updateData.priceEach = update.updates.totalPrice / existing.quantity;
          }
        }

        if (update.updates.section !== undefined) {
          updateData.section = update.updates.section;
        }

        if (update.updates.row !== undefined) {
          updateData.row = update.updates.row;
        }

        if (update.updates.seats !== undefined) {
          updateData.seats = update.updates.seats;
        }

        if (Object.keys(updateData).length === 0) {
          continue; // No actual updates
        }

        await prisma.purchase.update({
          where: { id: update.purchaseId },
          data: updateData,
        });

        updatedCount++;
      } catch (error) {
        errors.push({
          purchaseId: update.purchaseId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Update duplicates error:", error);
    return NextResponse.json(
      { error: "Failed to update purchases", details: String(error) },
      { status: 500 }
    );
  }
}
