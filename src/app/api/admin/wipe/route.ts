import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * DELETE /api/admin/wipe
 * Wipes all data from the database. Use with caution!
 * 
 * Query params:
 * - confirm: must be "yes" to proceed
 * - tables: comma-separated list of tables to wipe, or "all" (default)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get("confirm");
    const tables = searchParams.get("tables") || "all";

    if (confirm !== "yes") {
      return NextResponse.json(
        { 
          error: "Confirmation required", 
          message: "Add ?confirm=yes to proceed with data wipe" 
        },
        { status: 400 }
      );
    }

    const tablesToWipe = tables === "all" 
      ? ["purchases", "queuePositions", "accountProxies", "cards", "accounts", "events", "proxies", "imapCredentials"]
      : tables.split(",").map(t => t.trim());

    const results: Record<string, number> = {};

    // Delete in order to respect foreign key constraints
    // Order: purchases -> queuePositions -> cards -> accountProxies -> accounts -> events -> proxies -> imapCredentials

    if (tablesToWipe.includes("purchases")) {
      const { count } = await prisma.purchase.deleteMany({});
      results.purchases = count;
    }

    if (tablesToWipe.includes("queuePositions")) {
      const { count } = await prisma.queuePosition.deleteMany({});
      results.queuePositions = count;
    }

    if (tablesToWipe.includes("cards")) {
      const { count } = await prisma.card.deleteMany({});
      results.cards = count;
    }

    if (tablesToWipe.includes("accountProxies")) {
      const { count } = await prisma.accountProxy.deleteMany({});
      results.accountProxies = count;
    }

    if (tablesToWipe.includes("accounts")) {
      const { count } = await prisma.account.deleteMany({});
      results.accounts = count;
    }

    if (tablesToWipe.includes("events")) {
      const { count } = await prisma.event.deleteMany({});
      results.events = count;
    }

    if (tablesToWipe.includes("proxies")) {
      const { count } = await prisma.proxy.deleteMany({});
      results.proxies = count;
    }

    if (tablesToWipe.includes("imapCredentials")) {
      const { count } = await prisma.imapCredential.deleteMany({});
      results.imapCredentials = count;
    }

    return NextResponse.json({
      success: true,
      message: "Data wiped successfully",
      deleted: results,
      totalDeleted: Object.values(results).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    console.error("Wipe error:", error);
    return NextResponse.json(
      { error: "Failed to wipe data", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/wipe
 * Returns current record counts for all tables
 */
export async function GET() {
  try {
    const [
      accounts,
      cards,
      proxies,
      accountProxies,
      events,
      queuePositions,
      purchases,
      imapCredentials,
    ] = await Promise.all([
      prisma.account.count(),
      prisma.card.count(),
      prisma.proxy.count(),
      prisma.accountProxy.count(),
      prisma.event.count(),
      prisma.queuePosition.count(),
      prisma.purchase.count(),
      prisma.imapCredential.count(),
    ]);

    return NextResponse.json({
      counts: {
        accounts,
        cards,
        proxies,
        accountProxies,
        events,
        queuePositions,
        purchases,
        imapCredentials,
      },
      total: accounts + cards + proxies + accountProxies + events + queuePositions + purchases + imapCredentials,
    });
  } catch (error) {
    console.error("Count error:", error);
    return NextResponse.json(
      { error: "Failed to get counts", details: String(error) },
      { status: 500 }
    );
  }
}
