import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/checkout/export
 * 
 * Export checkout jobs to CSV format.
 * 
 * Query Parameters:
 * - runId: Filter by specific run ID
 * - status: Filter by status (e.g., SUCCESS, FAILED)
 * - imported: Filter by import status ("true" or "false")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const status = searchParams.get("status");
    const imported = searchParams.get("imported");

    // Build where clause
    const where: Record<string, unknown> = {};
    
    if (runId) {
      where.runId = runId;
    }
    if (status) {
      where.status = status;
    }
    if (imported !== null) {
      where.imported = imported === "true";
    }

    // Fetch jobs with related data
    const jobs = await prisma.checkoutJob.findMany({
      where,
      include: {
        account: {
          select: {
            email: true,
            phoneNumber: true,
          },
        },
        card: {
          select: {
            cardNumber: true,
            cardType: true,
            expMonth: true,
            expYear: true,
            cvv: true,
            billingName: true,
            billingPhone: true,
            billingAddress: true,
            billingZip: true,
            billingCity: true,
            billingState: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    // Build CSV
    const headers = [
      "Job ID",
      "Status",
      "Event Name",
      "Event ID",
      "Event Date",
      "Venue",
      "Section",
      "Row",
      "Seats",
      "Quantity",
      "Price Each",
      "Total Price",
      "Currency",
      "Account Email",
      "Card Last 4",
      "Card Type",
      "Billing Name",
      "TM Order Number",
      "Error Code",
      "Error Message",
      "Target URL",
      "Final URL",
      "Created At",
      "Started At",
      "Completed At",
      "Attempt Count",
      "Imported",
      "Worker ID",
      "Run ID",
    ];

    const rows = jobs.map((job) => [
      job.id,
      job.status,
      job.eventName || "",
      job.tmEventId || "",
      job.eventDate || "",
      job.venue || "",
      job.section || "",
      job.row || "",
      job.seats || "",
      job.quantity,
      job.priceEach?.toString() || "",
      job.totalPrice?.toString() || "",
      job.currency || "",
      job.accountEmail || job.account?.email || "",
      job.cardLast4 || (job.card?.cardNumber ? job.card.cardNumber.slice(-4) : ""),
      job.card?.cardType || "",
      job.card?.billingName || "",
      job.tmOrderNumber || "",
      job.errorCode || "",
      job.errorMessage || "",
      job.targetUrl || "",
      job.finalUrl || "",
      job.createdAt?.toISOString() || "",
      job.startedAt?.toISOString() || "",
      job.completedAt?.toISOString() || "",
      job.attemptCount,
      job.imported ? "Yes" : "No",
      job.workerId || "",
      job.runId || "",
    ]);

    // Escape CSV values
    const escapeCSV = (val: unknown): string => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Return as downloadable file
    const filename = `checkout_export_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Export failed", details: String(error) },
      { status: 500 }
    );
  }
}
