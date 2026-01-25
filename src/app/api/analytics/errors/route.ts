import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";

export async function GET() {
  try {
    // Get total counts
    const [totalFailed, totalSuccess] = await Promise.all([
      prisma.purchase.count({ where: { status: PurchaseStatus.FAILED } }),
      prisma.purchase.count({ where: { status: PurchaseStatus.SUCCESS } }),
    ]);

    const total = totalFailed + totalSuccess;
    const failureRate = total > 0 ? (totalFailed / total) * 100 : 0;

    // Get error code breakdown
    const errorCounts = await prisma.purchase.groupBy({
      by: ["errorCode"],
      where: { status: PurchaseStatus.FAILED },
      _count: true,
      orderBy: { _count: { errorCode: "desc" } },
    });

    const errorBreakdown = errorCounts.map((item) => ({
      errorCode: item.errorCode || "Unknown",
      count: item._count,
      percentage: totalFailed > 0 ? (item._count / totalFailed) * 100 : 0,
    }));

    // Get problematic accounts (accounts with high failure rates)
    const accountStats = await prisma.purchase.groupBy({
      by: ["accountId", "status"],
      _count: true,
    });

    // Aggregate by account
    const accountMap = new Map<string, { failures: number; successes: number }>();
    for (const stat of accountStats) {
      const existing = accountMap.get(stat.accountId) || { failures: 0, successes: 0 };
      if (stat.status === PurchaseStatus.FAILED) {
        existing.failures += stat._count;
      } else {
        existing.successes += stat._count;
      }
      accountMap.set(stat.accountId, existing);
    }

    // Filter to accounts with multiple failures
    const problematicAccountIds = Array.from(accountMap.entries())
      .filter(([_, stats]) => stats.failures >= 2)
      .sort((a, b) => b[1].failures - a[1].failures)
      .slice(0, 10)
      .map(([id]) => id);

    // Get account details and last error
    const problematicAccounts = await Promise.all(
      problematicAccountIds.map(async (accountId) => {
        const [account, lastFailure] = await Promise.all([
          prisma.account.findUnique({
            where: { id: accountId },
            select: { id: true, email: true },
          }),
          prisma.purchase.findFirst({
            where: { accountId, status: PurchaseStatus.FAILED },
            orderBy: { createdAt: "desc" },
            select: { errorCode: true, createdAt: true },
          }),
        ]);

        const stats = accountMap.get(accountId)!;
        const total = stats.failures + stats.successes;

        return {
          accountId,
          email: account?.email || "Unknown",
          failureCount: stats.failures,
          successCount: stats.successes,
          failureRate: total > 0 ? (stats.failures / total) * 100 : 0,
          lastError: lastFailure?.errorCode || "Unknown",
          lastErrorDate: lastFailure?.createdAt?.toISOString() || "",
        };
      })
    );

    // Get recent errors
    const recentErrors = await prisma.purchase.findMany({
      where: { status: PurchaseStatus.FAILED },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        account: { select: { email: true } },
        event: { select: { eventName: true } },
      },
    });

    return NextResponse.json({
      totalFailed,
      totalSuccess,
      failureRate,
      errorBreakdown,
      problematicAccounts: problematicAccounts.sort((a, b) => b.failureRate - a.failureRate),
      recentErrors: recentErrors.map((e) => ({
        id: e.id,
        email: e.account.email,
        errorCode: e.errorCode || "Unknown",
        errorMessage: e.errorMessage || "",
        eventName: e.event?.eventName || "Unknown",
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics", details: String(error) },
      { status: 500 }
    );
  }
}
