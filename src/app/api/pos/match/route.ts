import { NextRequest, NextResponse } from "next/server";
import { TicketVaultApi } from "@/lib/services/ticketvault-api";
import prisma from "@/lib/db";

/**
 * GET /api/pos/match?poNumber=000001
 * Check if a ticket is matched (has barcodes/PDFs synced)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const poNumber = searchParams.get("poNumber");

    if (!poNumber) {
      return NextResponse.json(
        { success: false, error: "poNumber is required" },
        { status: 400 }
      );
    }

    const status = await TicketVaultApi.checkTicketMatchStatus(poNumber);

    return NextResponse.json({
      success: true,
      poNumber,
      ...status,
    });
  } catch (error) {
    console.error("Check match status error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/match
 * Trigger sync for an account to pull tickets
 * 
 * Body:
 * - email: Account email to sync
 * OR
 * - poNumber: Will look up the account email from this ticket and sync it
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, poNumber } = body;

    let accountEmail = email;

    // If poNumber provided, look up the account email
    if (!accountEmail && poNumber) {
      // First try from POS
      const info = await TicketVaultApi.getOperationsInfoByExtPONumber(poNumber);
      if (info?.AccountEmail) {
        accountEmail = info.AccountEmail;
      }
      
      // Fall back to dashboard lookup
      if (!accountEmail) {
        const purchase = await prisma.purchase.findFirst({
          where: { dashboardPoNumber: poNumber },
          include: { account: { select: { email: true } } },
        });
        
        if (purchase?.account?.email) {
          accountEmail = purchase.account.email;
        }
      }
      
      if (!accountEmail) {
        return NextResponse.json(
          { success: false, error: `Could not find account email for PO: ${poNumber}` },
          { status: 404 }
        );
      }
    }

    if (!accountEmail) {
      return NextResponse.json(
        { success: false, error: "email or poNumber is required" },
        { status: 400 }
      );
    }

    const result = await TicketVaultApi.syncAccountByEmail(accountEmail);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Sync triggered for account: ${accountEmail}`,
      accountEmail,
      seasonSiteId: result.seasonSiteId,
    });
  } catch (error) {
    console.error("Trigger sync error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
