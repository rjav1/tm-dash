import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { TicketVaultApi } from "@/lib/services/ticketvault-api";

/**
 * POST /api/pos/fix-notes
 * Update internal notes on already synced tickets that are missing them
 * Looks up the correct TicketVault ticket group ID by ExtPONumber
 */
export async function POST() {
  try {
    // Get all synced purchases with their account emails and PO numbers
    const syncedPurchases = await prisma.purchase.findMany({
      where: {
        posSyncedAt: { not: null },
        dashboardPoNumber: { not: null },
      },
      include: {
        account: {
          select: { email: true },
        },
      },
    });

    if (syncedPurchases.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No synced purchases found",
        updated: 0,
      });
    }

    const results: Array<{
      poNumber: string | null;
      ticketGroupId: string | number;
      email: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const purchase of syncedPurchases) {
      const email = purchase.account?.email;
      const poNumber = purchase.dashboardPoNumber;

      if (!email || !poNumber) {
        results.push({
          poNumber,
          ticketGroupId: "N/A",
          email: email || "N/A",
          success: false,
          error: "Missing email or PO number",
        });
        continue;
      }

      try {
        // Look up the correct TicketVault TicketGroupID using GetOperationsInfo
        const operationsInfo = await TicketVaultApi.getOperationsInfoByExtPONumber(poNumber);
        
        if (!operationsInfo) {
          results.push({
            poNumber,
            ticketGroupId: "NOT_FOUND",
            email,
            success: false,
            error: `Ticket group not found in POS for ExtPONumber ${poNumber}`,
          });
          continue;
        }

        const ticketGroupId = operationsInfo.TicketGroupID;
        
        await TicketVaultApi.updateTicketGroupNotes([ticketGroupId], email);
        results.push({
          poNumber,
          ticketGroupId: ticketGroupId.toString(),
          email,
          success: true,
        });
      } catch (error) {
        results.push({
          poNumber,
          ticketGroupId: "ERROR",
          email,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      total: syncedPurchases.length,
      updated: successCount,
      failed: syncedPurchases.length - successCount,
      results,
    });
  } catch (error) {
    console.error("Fix internal notes error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
