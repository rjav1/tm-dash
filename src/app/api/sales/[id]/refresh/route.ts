/**
 * Sale Refresh API Route
 * 
 * POST /api/sales/[id]/refresh - Trigger account sync for a sale
 * 
 * This will:
 * 1. Find the account associated with the sale
 * 2. Import the account to POS if not already (as Purchase Account + Season Site)
 * 3. Trigger TicketVault account sync to pull tickets from the TM account
 * 
 * This is the same as clicking "Match" on the listings page - it tells TicketVault
 * to sync the account so tickets can be transferred.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { importAccountToPos } from "@/lib/services/account-pos-sync";
import * as TicketVaultApi from "@/lib/services/ticketvault-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: saleId } = await params;
    
    console.log(`[Sale Refresh] Starting refresh for sale ${saleId}`);
    
    // Get the sale with all related data
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        listing: {
          include: {
            purchase: {
              include: {
                account: true,
              },
            },
          },
        },
      },
    });
    
    if (!sale) {
      return NextResponse.json(
        { success: false, error: "Sale not found" },
        { status: 404 }
      );
    }
    
    const steps: string[] = [];
    let accountEmail: string | null = null;
    let accountId: string | null = null;
    
    // Try to find the account - either from listing->purchase->account or by looking up with extPONumber
    if (sale.listing?.purchase?.account) {
      accountEmail = sale.listing.purchase.account.email;
      accountId = sale.listing.purchase.account.id;
    } else if (sale.extPONumber) {
      // Look up purchase by PO number
      const purchase = await prisma.purchase.findFirst({
        where: { dashboardPoNumber: sale.extPONumber },
        include: { account: true },
      });
      if (purchase?.account) {
        accountEmail = purchase.account.email;
        accountId = purchase.account.id;
      }
    }
    
    if (!accountEmail) {
      return NextResponse.json({
        success: false,
        error: "No linked account found for this sale",
        steps: ["Could not find account email for this sale"],
      });
    }
    
    // Step 1: Check if account is already in POS as a Season Site
    let site = await TicketVaultApi.findSeasonSiteByEmail(accountEmail);
    
    if (!site) {
      // Check if it's a Purchase Account
      const purchaseAccount = await TicketVaultApi.findPurchaseAccountByEmail(accountEmail);
      
      if (purchaseAccount) {
        // Already a Purchase Account, just need to add as Season Site
        steps.push(`Account ${accountEmail} is Purchase Account, adding as Season Site...`);
        const addResult = await TicketVaultApi.addSeasonSite([purchaseAccount.PurchaseAccountId]);
        
        if (addResult.success && addResult.seasonSites?.length) {
          steps.push(`Added ${accountEmail} as Season Site`);
          site = await TicketVaultApi.findSeasonSiteByEmail(accountEmail);
        } else {
          return NextResponse.json({
            success: false,
            error: `Failed to add as Season Site: ${addResult.error || 'Unknown error'}`,
            accountEmail,
            steps,
          });
        }
      } else {
        // Need to import account to POS first
        if (accountId) {
          steps.push(`Account ${accountEmail} not in POS, importing...`);
          const importResult = await importAccountToPos(accountId);
          
          if (importResult.success) {
            steps.push(`Imported ${accountEmail} to POS (ID: ${importResult.posAccountId})`);
            // Now it should be a Season Site
            site = await TicketVaultApi.findSeasonSiteByEmail(accountEmail);
          } else {
            return NextResponse.json({
              success: false,
              error: `Failed to import account: ${importResult.error}`,
              accountEmail,
              steps,
            });
          }
        } else {
          return NextResponse.json({
            success: false,
            error: `Account ${accountEmail} not in POS and no local account found to import`,
            accountEmail,
            steps,
          });
        }
      }
    } else {
      steps.push(`Account ${accountEmail} already in POS as Season Site`);
    }
    
    // Step 2: Trigger account sync in TicketVault
    if (site) {
      steps.push(`Triggering account sync for ${accountEmail}...`);
      const syncResult = await TicketVaultApi.syncAccountByEmail(accountEmail);
      
      if (syncResult.success) {
        steps.push(`Account sync triggered (Season Site ID: ${syncResult.seasonSiteId})`);
      } else {
        steps.push(`Account sync failed: ${syncResult.error}`);
      }
    }
    
    console.log(`[Sale Refresh] Completed for sale ${saleId}: ${steps.join(", ")}`);
    
    return NextResponse.json({
      success: true,
      message: "Account sync triggered",
      accountEmail,
      steps,
    });
    
  } catch (error) {
    console.error("[Sale Refresh] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to refresh sale"
      },
      { status: 500 }
    );
  }
}
