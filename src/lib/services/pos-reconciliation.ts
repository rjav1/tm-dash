/**
 * POS Reconciliation Service
 *
 * Keeps the dashboard and TicketVault POS in sync by:
 * 1. Finding POS tickets that match our purchases but are missing ExtPONumber
 * 2. Finding POS tickets that don't exist in our dashboard
 * 3. Providing actions to fix each discrepancy
 */

import prisma from "@/lib/db";
import {
  TicketVaultApi,
  TicketGroupDetail,
  TicketVaultPurchaseOrder,
} from "./ticketvault-api";
import { assignPoNumber, parseSeats } from "./pos-sync";

// =============================================================================
// Types
// =============================================================================

export interface ReconciliationIssue {
  type:
    | "pos_missing_extpo" // POS ticket exists but missing our ExtPONumber
    | "pos_not_in_dashboard" // POS ticket doesn't exist in dashboard
    | "dashboard_not_in_pos"; // Dashboard purchase not synced to POS
  severity: "high" | "medium" | "low";
  description: string;
  // POS data
  posOrderId?: number;
  posTicketGroupId?: string;
  posSection?: string;
  posRow?: string;
  posSeats?: string;
  posQuantity?: number;
  posAccountEmail?: string | null;
  posExtPONumber?: string | null;
  posEventName?: string;
  // Dashboard data
  dashboardPurchaseId?: string;
  dashboardPoNumber?: string;
  dashboardSection?: string;
  dashboardRow?: string;
  dashboardSeats?: string;
  dashboardQuantity?: number;
  dashboardAccountEmail?: string;
  // Suggested action
  suggestedAction: string;
}

export interface ReconciliationResult {
  issues: ReconciliationIssue[];
  summary: {
    posMissingExtPo: number;
    posNotInDashboard: number;
    dashboardNotInPos: number;
    total: number;
  };
}

export interface FixResult {
  success: boolean;
  action: string;
  details?: string;
  error?: string;
}

// =============================================================================
// Reconciliation Functions
// =============================================================================

/**
 * Compare dashboard purchases with POS ticket groups and identify discrepancies
 */
export async function runReconciliation(): Promise<ReconciliationResult> {
  const issues: ReconciliationIssue[] = [];

  // Get all POS orders with their ticket groups
  const posOrders = await TicketVaultApi.getPurchaseOrders({ take: 200 });
  const posTicketGroups: Array<{
    order: TicketVaultPurchaseOrder;
    ticketGroup: TicketGroupDetail;
  }> = [];

  for (const order of posOrders) {
    try {
      const ticketGroups = await TicketVaultApi.getTicketGroupsForPO(order.Id);
      for (const tg of ticketGroups) {
        posTicketGroups.push({ order, ticketGroup: tg });
      }
    } catch (error) {
      console.warn(`[Reconciliation] Could not fetch ticket groups for PO ${order.Id}:`, error);
    }
  }

  // Get all dashboard purchases with their details
  const dashboardPurchases = await prisma.purchase.findMany({
    where: { status: "SUCCESS" },
    include: {
      account: { select: { email: true } },
      event: { select: { eventName: true, venue: true } },
    },
  });

  // Create lookup maps
  const dashboardByPoNumber = new Map(
    dashboardPurchases
      .filter((p) => p.dashboardPoNumber)
      .map((p) => [p.dashboardPoNumber!, p])
  );

  const dashboardBySectionRowSeats = new Map(
    dashboardPurchases.map((p) => {
      const key = `${p.section}|${p.row}|${p.seats}|${p.quantity}`;
      return [key, p];
    })
  );

  // Check each POS ticket group
  for (const { order, ticketGroup: tg } of posTicketGroups) {
    const posSeats = `${tg.StartSeat}-${tg.EndSeat}`;
    const posKey = `${tg.Section}|${tg.Row}|${posSeats}|${tg.Quantity}`;

    // Check if this POS ticket has our ExtPONumber
    if (tg.ExtPONumber && dashboardByPoNumber.has(tg.ExtPONumber)) {
      // Already synced correctly - no issue
      continue;
    }

    // Check if we can match by section/row/seats
    const matchBySeats = dashboardBySectionRowSeats.get(posKey);
    
    // Also try matching by account email + section + row
    let matchByEmailAndSection = null;
    if (tg.AccountEmail) {
      matchByEmailAndSection = dashboardPurchases.find(
        (p) =>
          p.account?.email === tg.AccountEmail &&
          p.section === tg.Section &&
          p.row === tg.Row &&
          p.quantity === tg.Quantity
      );
    }

    const bestMatch = matchByEmailAndSection || matchBySeats;

    if (bestMatch) {
      if (!tg.ExtPONumber || tg.ExtPONumber !== bestMatch.dashboardPoNumber) {
        // POS ticket matches a dashboard purchase but missing/wrong ExtPONumber
        issues.push({
          type: "pos_missing_extpo",
          severity: "high",
          description: `POS ticket matches dashboard purchase but ${tg.ExtPONumber ? "has wrong" : "missing"} ExtPONumber`,
          posOrderId: order.Id,
          posTicketGroupId: tg.Id,
          posSection: tg.Section,
          posRow: tg.Row,
          posSeats,
          posQuantity: tg.Quantity,
          posAccountEmail: tg.AccountEmail,
          posExtPONumber: tg.ExtPONumber,
          posEventName: tg.EventName,
          dashboardPurchaseId: bestMatch.id,
          dashboardPoNumber: bestMatch.dashboardPoNumber || undefined,
          dashboardSection: bestMatch.section || undefined,
          dashboardRow: bestMatch.row || undefined,
          dashboardSeats: bestMatch.seats || undefined,
          dashboardQuantity: bestMatch.quantity,
          dashboardAccountEmail: bestMatch.account?.email,
          suggestedAction: bestMatch.dashboardPoNumber
            ? `Update POS ticket ${tg.Id} with ExtPONumber=${bestMatch.dashboardPoNumber}`
            : `Assign PO number to dashboard purchase first, then update POS`,
        });
      }
    } else {
      // POS ticket doesn't match any dashboard purchase
      issues.push({
        type: "pos_not_in_dashboard",
        severity: "medium",
        description: `POS ticket not found in dashboard - may need to import`,
        posOrderId: order.Id,
        posTicketGroupId: tg.Id,
        posSection: tg.Section,
        posRow: tg.Row,
        posSeats,
        posQuantity: tg.Quantity,
        posAccountEmail: tg.AccountEmail,
        posExtPONumber: tg.ExtPONumber,
        posEventName: tg.EventName,
        suggestedAction: `Import this ticket to dashboard, assign PO number, then update POS`,
      });
    }
  }

  // Check dashboard purchases not synced to POS
  for (const purchase of dashboardPurchases) {
    if (purchase.posSyncedAt) continue; // Already synced

    issues.push({
      type: "dashboard_not_in_pos",
      severity: "low",
      description: `Dashboard purchase not synced to POS`,
      dashboardPurchaseId: purchase.id,
      dashboardPoNumber: purchase.dashboardPoNumber || undefined,
      dashboardSection: purchase.section || undefined,
      dashboardRow: purchase.row || undefined,
      dashboardSeats: purchase.seats || undefined,
      dashboardQuantity: purchase.quantity,
      dashboardAccountEmail: purchase.account?.email,
      suggestedAction: `Sync this purchase to POS`,
    });
  }

  return {
    issues,
    summary: {
      posMissingExtPo: issues.filter((i) => i.type === "pos_missing_extpo").length,
      posNotInDashboard: issues.filter((i) => i.type === "pos_not_in_dashboard").length,
      dashboardNotInPos: issues.filter((i) => i.type === "dashboard_not_in_pos").length,
      total: issues.length,
    },
  };
}

// =============================================================================
// Fix Functions
// =============================================================================

/**
 * Fix a POS ticket that's missing our ExtPONumber
 * Updates the POS ticket group with our dashboard PO number
 */
export async function fixMissingExtPONumber(
  posTicketGroupId: string,
  dashboardPurchaseId: string
): Promise<FixResult> {
  try {
    // Get the dashboard purchase
    const purchase = await prisma.purchase.findUnique({
      where: { id: dashboardPurchaseId },
      include: {
        account: { select: { email: true } },
      },
    });

    if (!purchase) {
      return { success: false, action: "fix_extpo", error: "Dashboard purchase not found" };
    }

    // Assign PO number if not already assigned
    let poNumber = purchase.dashboardPoNumber;
    if (!poNumber) {
      poNumber = await assignPoNumber(dashboardPurchaseId);
    }

    // Get the POS ticket group details
    const ticketGroups = await TicketVaultApi.getTicketGroupsByIds([posTicketGroupId]);
    if (ticketGroups.length === 0) {
      return { success: false, action: "fix_extpo", error: "POS ticket group not found" };
    }

    const tg = ticketGroups[0];

    const accountEmail = purchase.account?.email || tg.AccountEmail || "";

    // Update the POS ticket group with our ExtPONumber and AccountEmail
    await TicketVaultApi.updateTicketGroups(
      [parseInt(posTicketGroupId, 10)],
      {
        section: tg.Section,
        row: tg.Row,
        quantity: tg.Quantity,
        startSeat: tg.StartSeat,
        endSeat: tg.EndSeat,
        ticketCost: tg.CostPerTicket,
        ticketCostTotal: tg.CostPerTicket * tg.Quantity,
        extPONumber: poNumber,
        accountEmail,
      }
    );

    // Also update internal notes with the account email
    if (accountEmail) {
      await TicketVaultApi.updateTicketGroupNotes(
        [parseInt(posTicketGroupId, 10)],
        accountEmail
      );
    }

    // Update the dashboard purchase to mark as synced
    await prisma.purchase.update({
      where: { id: dashboardPurchaseId },
      data: {
        posSyncedAt: new Date(),
        posTicketGroupId: parseInt(posTicketGroupId, 10),
        posPurchaseOrderId: tg.PurchaseOrderID,
        posEventId: tg.ProductionId,
      },
    });

    return {
      success: true,
      action: "fix_extpo",
      details: `Updated POS ticket ${posTicketGroupId} with ExtPONumber=${poNumber}, InternalNotes=${accountEmail}, and marked dashboard purchase as synced`,
    };
  } catch (error) {
    return {
      success: false,
      action: "fix_extpo",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Import a POS ticket that doesn't exist in dashboard
 * Creates a dashboard purchase, assigns PO number, then updates POS
 */
export async function importPosTicketToDashboard(
  posTicketGroupId: string,
  accountId?: string // Optional - if we know which account this belongs to
): Promise<FixResult> {
  try {
    // Get the POS ticket group details
    const ticketGroups = await TicketVaultApi.getTicketGroupsByIds([posTicketGroupId]);
    if (ticketGroups.length === 0) {
      return { success: false, action: "import_pos", error: "POS ticket group not found" };
    }

    const tg = ticketGroups[0];

    // Find the account by email if not provided
    let finalAccountId = accountId;
    if (!finalAccountId && tg.AccountEmail) {
      const account = await prisma.account.findFirst({
        where: { email: tg.AccountEmail },
        select: { id: true },
      });
      if (account) {
        finalAccountId = account.id;
      }
    }

    if (!finalAccountId) {
      return {
        success: false,
        action: "import_pos",
        error: `Could not find account for email: ${tg.AccountEmail}. Create the account first or provide accountId.`,
      };
    }

    // Find or create the event
    let event = await prisma.event.findFirst({
      where: {
        eventName: { contains: tg.EventName },
      },
      select: { id: true },
    });

    if (!event) {
      // Create a minimal event record with a generated tmEventId
      const generatedTmEventId = `POS-${tg.Id}-${Date.now()}`;
      event = await prisma.event.create({
        data: {
          tmEventId: generatedTmEventId,
          eventName: tg.PrimaryEventName || tg.EventName,
          venue: tg.VenueName,
          eventDateRaw: tg.EventDateTime,
        },
        select: { id: true },
      });
    }

    // Create the dashboard purchase
    const seats = `${tg.StartSeat}-${tg.EndSeat}`;
    const totalPrice = tg.CostPerTicket * tg.Quantity;

    const newPurchase = await prisma.purchase.create({
      data: {
        accountId: finalAccountId,
        eventId: event.id,
        status: "SUCCESS",
        section: tg.Section,
        row: tg.Row,
        seats,
        quantity: tg.Quantity,
        priceEach: tg.CostPerTicket,
        totalPrice,
        posSyncedAt: new Date(),
        posTicketGroupId: parseInt(tg.Id, 10),
        posPurchaseOrderId: tg.PurchaseOrderID,
        posEventId: tg.ProductionId,
      },
    });

    // Assign a PO number
    const poNumber = await assignPoNumber(newPurchase.id);

    const accountEmail = tg.AccountEmail || "";

    // Update the POS ticket with our ExtPONumber
    await TicketVaultApi.updateTicketGroups(
      [parseInt(posTicketGroupId, 10)],
      {
        section: tg.Section,
        row: tg.Row,
        quantity: tg.Quantity,
        startSeat: tg.StartSeat,
        endSeat: tg.EndSeat,
        ticketCost: tg.CostPerTicket,
        ticketCostTotal: totalPrice,
        extPONumber: poNumber,
        accountEmail,
      }
    );

    // Also update internal notes with the account email
    if (accountEmail) {
      await TicketVaultApi.updateTicketGroupNotes(
        [parseInt(posTicketGroupId, 10)],
        accountEmail
      );
    }

    return {
      success: true,
      action: "import_pos",
      details: `Imported POS ticket to dashboard as purchase ${newPurchase.id}, assigned PO#${poNumber}, updated POS with InternalNotes=${accountEmail}`,
    };
  } catch (error) {
    return {
      success: false,
      action: "import_pos",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

export const PosReconciliationService = {
  runReconciliation,
  fixMissingExtPONumber,
  importPosTicketToDashboard,
};
