import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/checkout/jobs/[id]/import
 * Import a successful checkout job as a Purchase record
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Fetch the checkout job
    const job = await prisma.checkoutJob.findUnique({
      where: { id },
      include: {
        account: true,
        card: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Checkout job not found" },
        { status: 404 }
      );
    }

    // Verify job is successful and not already imported
    if (job.status !== "SUCCESS") {
      return NextResponse.json(
        { error: "Only successful jobs can be imported" },
        { status: 400 }
      );
    }

    if (job.imported) {
      return NextResponse.json(
        { error: "Job has already been imported", purchaseId: job.purchaseId },
        { status: 400 }
      );
    }

    // Check for duplicate externalJobId
    const existingPurchase = await prisma.purchase.findUnique({
      where: { externalJobId: id },
    });

    if (existingPurchase) {
      // Mark job as imported and link to existing purchase
      await prisma.checkoutJob.update({
        where: { id },
        data: {
          imported: true,
          importedAt: new Date(),
          purchaseId: existingPurchase.id,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Job was already imported",
        purchaseId: existingPurchase.id,
        alreadyExisted: true,
      });
    }

    // Create account if needed
    let accountId = job.accountId;
    if (!accountId && job.accountEmail) {
      const account = await prisma.account.upsert({
        where: { email: job.accountEmail.toLowerCase() },
        create: {
          email: job.accountEmail.toLowerCase(),
          status: "ACTIVE",
        },
        update: {},
      });
      accountId = account.id;
    }

    if (!accountId) {
      return NextResponse.json(
        { error: "No account associated with this job" },
        { status: 400 }
      );
    }

    // Find or create event
    let eventId: string | undefined;
    if (job.tmEventId) {
      const event = await prisma.event.upsert({
        where: { tmEventId: job.tmEventId },
        create: {
          tmEventId: job.tmEventId,
          eventName: job.eventName || "Unknown Event",
          venue: job.venue || undefined,
          eventDateRaw: job.eventDate || undefined,
          eventDate: job.eventDate ? parseEventDate(job.eventDate) : null,
        },
        update: {},
      });
      eventId = event.id;
    }

    // Create the purchase
    const purchase = await prisma.purchase.create({
      data: {
        accountId,
        eventId,
        cardId: job.cardId,
        externalJobId: id,
        tmOrderNumber: job.tmOrderNumber,
        status: PurchaseStatus.SUCCESS,
        errorCode: null,
        errorMessage: null,
        cardLast4: job.cardLast4 || job.card?.cardNumber?.slice(-4) || null,
        quantity: job.quantity,
        priceEach: job.priceEach,
        totalPrice: job.totalPrice,
        section: job.section,
        row: job.row,
        seats: job.seats,
        checkoutUrl: job.targetUrl,
        confirmationUrl: job.finalUrl,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        attemptCount: job.attemptCount,
      },
    });

    // Update the checkout job as imported
    await prisma.checkoutJob.update({
      where: { id },
      data: {
        imported: true,
        importedAt: new Date(),
        purchaseId: purchase.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Checkout job imported as purchase",
      purchaseId: purchase.id,
    });
  } catch (error) {
    console.error("Error importing checkout job:", error);
    return NextResponse.json(
      { error: "Failed to import checkout job" },
      { status: 500 }
    );
  }
}

/**
 * Parse event date string to Date object
 */
function parseEventDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const cleaned = dateStr.replace(" at ", " ");
    const date = new Date(cleaned);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}
