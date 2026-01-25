/**
 * POS Reconciliation API Routes
 *
 * GET /api/pos/reconcile - Run reconciliation and get issues
 * POST /api/pos/reconcile - Fix a specific issue
 */

import { NextRequest, NextResponse } from "next/server";
import {
  PosReconciliationService,
  ReconciliationIssue,
} from "@/lib/services/pos-reconciliation";

/**
 * GET /api/pos/reconcile
 * Run reconciliation between dashboard and POS
 */
export async function GET() {
  try {
    console.log("[Reconciliation API] Running reconciliation...");
    const result = await PosReconciliationService.runReconciliation();
    console.log(`[Reconciliation API] Found ${result.summary.total} issues`);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[Reconciliation API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Reconciliation failed",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/reconcile
 * Fix a specific reconciliation issue
 *
 * Request body:
 * {
 *   action: "fix_extpo" | "import_pos"
 *   posTicketGroupId: string
 *   dashboardPurchaseId?: string - Required for fix_extpo
 *   accountId?: string - Optional for import_pos
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, posTicketGroupId, dashboardPurchaseId, accountId } = body;

    if (!action || !posTicketGroupId) {
      return NextResponse.json(
        { success: false, error: "action and posTicketGroupId are required" },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case "fix_extpo":
        if (!dashboardPurchaseId) {
          return NextResponse.json(
            { success: false, error: "dashboardPurchaseId is required for fix_extpo action" },
            { status: 400 }
          );
        }
        console.log(`[Reconciliation API] Fixing ExtPONumber for ticket ${posTicketGroupId}`);
        result = await PosReconciliationService.fixMissingExtPONumber(
          posTicketGroupId,
          dashboardPurchaseId
        );
        break;

      case "import_pos":
        console.log(`[Reconciliation API] Importing POS ticket ${posTicketGroupId}`);
        result = await PosReconciliationService.importPosTicketToDashboard(
          posTicketGroupId,
          accountId
        );
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Reconciliation API] Error fixing issue:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fix issue",
      },
      { status: 500 }
    );
  }
}
