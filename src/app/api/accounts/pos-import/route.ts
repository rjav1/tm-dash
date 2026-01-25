/**
 * Account POS Import API
 *
 * POST /api/accounts/pos-import - Import accounts to POS
 *
 * Request body:
 * - accountIds: string[] - Array of account IDs to import
 */

import { NextRequest, NextResponse } from "next/server";
import {
  importAccountToPos,
  importAccountsToPos,
} from "@/lib/services/account-pos-sync";

/**
 * POST /api/accounts/pos-import
 * Import one or more accounts to POS
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountIds, accountId } = body;

    // Support both single account and batch import
    if (accountId && typeof accountId === "string") {
      // Single account import
      console.log(`[Account POS Import API] Importing single account: ${accountId}`);
      
      const result = await importAccountToPos(accountId);
      
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            email: result.email,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        email: result.email,
        posAccountId: result.posAccountId,
      });
    }

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "accountIds array is required" },
        { status: 400 }
      );
    }

    // Batch import
    console.log(`[Account POS Import API] Importing ${accountIds.length} accounts...`);
    
    const result = await importAccountsToPos(accountIds);

    return NextResponse.json({
      success: result.success,
      imported: result.imported,
      failed: result.failed,
      results: result.results,
    });
  } catch (error) {
    console.error("[Account POS Import API] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
