/**
 * Account POS Sync Service
 *
 * Handles synchronization of accounts between dashboard and TicketVault POS:
 * 1. Syncing POS accounts to dashboard (marking which accounts are imported)
 * 2. Importing dashboard accounts to POS
 */

import prisma from "@/lib/db";
import {
  TicketVaultApi,
  TicketVaultPurchaseAccount,
  PURCHASE_SITES,
} from "./ticketvault-api";

// =============================================================================
// Types
// =============================================================================

export interface AccountSyncResult {
  success: boolean;
  synced: number;      // Accounts that were matched and marked as imported
  notInPos: number;    // Dashboard accounts not in POS
  error?: string;
}

export interface AccountImportResult {
  success: boolean;
  accountId: string;
  email: string;
  posAccountId?: number;
  error?: string;
}

export interface BatchImportResult {
  success: boolean;
  imported: number;
  failed: number;
  results: AccountImportResult[];
}

// =============================================================================
// Sync Functions
// =============================================================================

/**
 * Sync POS accounts to dashboard
 * Fetches all accounts from POS and updates our dashboard records
 * to mark which accounts have been imported
 */
export async function syncAccountsFromPos(): Promise<AccountSyncResult> {
  try {
    console.log("[AccountPosSync] Starting account sync from POS...");

    // Fetch all accounts from POS
    const posAccounts = await TicketVaultApi.getPurchaseAccounts();
    console.log(`[AccountPosSync] Found ${posAccounts.length} accounts in POS`);

    // Create a map of POS accounts by email (lowercase)
    const posAccountsByEmail = new Map<string, TicketVaultPurchaseAccount>();
    for (const pa of posAccounts) {
      if (pa.Username) {
        posAccountsByEmail.set(pa.Username.toLowerCase().trim(), pa);
      }
    }

    // Get all dashboard accounts
    const dashboardAccounts = await prisma.account.findMany({
      select: {
        id: true,
        email: true,
        posAccountId: true,
      },
    });

    let synced = 0;
    let notInPos = 0;

    // Update dashboard accounts with POS info
    for (const account of dashboardAccounts) {
      const posAccount = posAccountsByEmail.get(account.email.toLowerCase().trim());

      if (posAccount) {
        // Account exists in POS - update if needed
        if (account.posAccountId !== posAccount.PurchaseAccountId) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              posAccountId: posAccount.PurchaseAccountId,
              posImportedAt: account.posAccountId ? undefined : new Date(),
            },
          });
          synced++;
        }
      } else {
        // Account not in POS - clear posAccountId if it was set
        if (account.posAccountId !== null) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              posAccountId: null,
              posImportedAt: null,
            },
          });
        }
        notInPos++;
      }
    }

    console.log(`[AccountPosSync] Sync complete: ${synced} synced, ${notInPos} not in POS`);

    return {
      success: true,
      synced,
      notInPos,
    };
  } catch (error) {
    console.error("[AccountPosSync] Sync error:", error);
    return {
      success: false,
      synced: 0,
      notInPos: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Import a single account to POS
 */
export async function importAccountToPos(accountId: string): Promise<AccountImportResult> {
  try {
    // Get the account from dashboard
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        password: true,
        posAccountId: true,
      },
    });

    if (!account) {
      return {
        success: false,
        accountId,
        email: "unknown",
        error: "Account not found",
      };
    }

    // Check if already imported
    if (account.posAccountId) {
      return {
        success: true,
        accountId: account.id,
        email: account.email,
        posAccountId: account.posAccountId,
        error: "Account already imported to POS",
      };
    }

    // Check if password exists
    if (!account.password) {
      return {
        success: false,
        accountId: account.id,
        email: account.email,
        error: "Account password is required to import to POS",
      };
    }

    // First check if it already exists in POS (by email)
    const existingPosAccount = await TicketVaultApi.findPurchaseAccountByEmail(account.email);
    
    if (existingPosAccount) {
      // Already exists in POS - update our record
      await prisma.account.update({
        where: { id: account.id },
        data: {
          posAccountId: existingPosAccount.PurchaseAccountId,
          posImportedAt: new Date(),
        },
      });

      // Check if also a Season Site, if not add it
      const existingSeasonSite = await TicketVaultApi.findSeasonSiteByEmail(account.email);
      if (!existingSeasonSite) {
        try {
          const seasonSiteResult = await TicketVaultApi.addSeasonSite([existingPosAccount.PurchaseAccountId]);
          if (seasonSiteResult.success) {
            console.log(`[AccountPosSync] Added existing Purchase Account ${account.email} as Season Site`);
          }
        } catch (ssError) {
          console.warn(`[AccountPosSync] Error adding Season Site for existing account ${account.email}:`, ssError);
        }
      }

      return {
        success: true,
        accountId: account.id,
        email: account.email,
        posAccountId: existingPosAccount.PurchaseAccountId,
      };
    }

    // Create the account in POS
    const result = await TicketVaultApi.savePurchaseAccount(
      account.email,
      account.password,
      PURCHASE_SITES.TICKETMASTER
    );

    if (!result.success) {
      return {
        success: false,
        accountId: account.id,
        email: account.email,
        error: result.error || "Failed to create account in POS",
      };
    }

    // If we got the account back with ID, save it
    const posAccountId = result.account?.PurchaseAccountId || null;
    
    // Update our record - even if we don't have the ID yet, mark as imported
    // A sync from POS later will update the posAccountId
    await prisma.account.update({
      where: { id: account.id },
      data: {
        posAccountId: posAccountId,
        posImportedAt: new Date(),
      },
    });

    // Also add as Season Site (Sync Account) for ticket syncing
    if (posAccountId) {
      try {
        const seasonSiteResult = await TicketVaultApi.addSeasonSite([posAccountId]);
        if (seasonSiteResult.success) {
          console.log(`[AccountPosSync] Also added ${account.email} as Season Site`);
        } else {
          console.warn(`[AccountPosSync] Failed to add Season Site for ${account.email}: ${seasonSiteResult.error}`);
        }
      } catch (ssError) {
        console.warn(`[AccountPosSync] Error adding Season Site for ${account.email}:`, ssError);
      }
    }

    return {
      success: true,
      accountId: account.id,
      email: account.email,
      posAccountId: posAccountId || undefined,
    };
  } catch (error) {
    console.error(`[AccountPosSync] Import error for ${accountId}:`, error);
    return {
      success: false,
      accountId,
      email: "unknown",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Import multiple accounts to POS
 */
export async function importAccountsToPos(accountIds: string[]): Promise<BatchImportResult> {
  const results: AccountImportResult[] = [];
  let imported = 0;
  let failed = 0;

  for (const accountId of accountIds) {
    const result = await importAccountToPos(accountId);
    results.push(result);
    
    if (result.success && result.posAccountId) {
      imported++;
    } else {
      failed++;
    }
  }

  return {
    success: failed === 0,
    imported,
    failed,
    results,
  };
}

/**
 * Get accounts that are not yet imported to POS
 */
export async function getAccountsNotInPos(): Promise<{
  id: string;
  email: string;
  hasPassword: boolean;
}[]> {
  const accounts = await prisma.account.findMany({
    where: {
      posAccountId: null,
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      password: true,
    },
  });

  return accounts.map(a => ({
    id: a.id,
    email: a.email,
    hasPassword: !!a.password,
  }));
}

/**
 * Get count of accounts by POS import status
 */
export async function getAccountPosStats(): Promise<{
  imported: number;
  notImported: number;
  total: number;
}> {
  const [imported, total] = await Promise.all([
    prisma.account.count({ where: { posAccountId: { not: null } } }),
    prisma.account.count(),
  ]);

  return {
    imported,
    notImported: total - imported,
    total,
  };
}

// =============================================================================
// Exports
// =============================================================================

export const AccountPosSync = {
  syncAccountsFromPos,
  importAccountToPos,
  importAccountsToPos,
  getAccountsNotInPos,
  getAccountPosStats,
};
