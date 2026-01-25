import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/checkout/jobs/[id]
 * Get a single checkout job with full details
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const job = await prisma.checkoutJob.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            email: true,
            status: true,
            phoneNumber: true,
          },
        },
        card: {
          select: {
            id: true,
            cardNumber: true,
            cardType: true,
            billingName: true,
            billingAddress: true,
            billingCity: true,
            billingState: true,
            billingZip: true,
            checkoutStatus: true,
          },
        },
        run: {
          select: {
            id: true,
            workerId: true,
            status: true,
            startedAt: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Checkout job not found" },
        { status: 404 }
      );
    }

    // Mask card number for display
    const maskedJob = {
      ...job,
      card: job.card
        ? {
            ...job.card,
            cardNumber: `****${job.card.cardNumber.slice(-4)}`,
            cardLast4: job.card.cardNumber.slice(-4),
          }
        : null,
    };

    return NextResponse.json({ job: maskedJob });
  } catch (error) {
    console.error("Error fetching checkout job:", error);
    return NextResponse.json(
      { error: "Failed to fetch checkout job" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/checkout/jobs/[id]
 * Update a checkout job (status, retry, cancel, etc.)
 * 
 * Body options:
 * - status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | "NEEDS_REVIEW" | "CANCELLED"
 * - workerId: string (when claiming a job)
 * - finalUrl: string (when checkout completes)
 * - errorCode: string (when checkout fails)
 * - errorMessage: string (when checkout fails)
 * - tmOrderNumber: string (when checkout succeeds)
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Verify job exists
    const existing = await prisma.checkoutJob.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Checkout job not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Status update
    if (body.status) {
      const validStatuses = ["QUEUED", "RUNNING", "SUCCESS", "FAILED", "NEEDS_REVIEW", "CANCELLED"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = body.status;

      // Set timing based on status change
      if (body.status === "RUNNING" && !existing.startedAt) {
        updateData.startedAt = new Date();
        updateData.attemptCount = existing.attemptCount + 1;
      }
      if (["SUCCESS", "FAILED", "NEEDS_REVIEW", "CANCELLED"].includes(body.status)) {
        updateData.completedAt = new Date();
      }
    }

    // Worker assignment
    if (body.workerId !== undefined) {
      updateData.workerId = body.workerId;
    }

    // Run assignment
    if (body.runId !== undefined) {
      updateData.runId = body.runId;
    }

    // Outcome fields
    if (body.finalUrl !== undefined) {
      updateData.finalUrl = body.finalUrl;
    }
    if (body.errorCode !== undefined) {
      updateData.errorCode = body.errorCode;
    }
    if (body.errorMessage !== undefined) {
      updateData.errorMessage = body.errorMessage;
    }
    if (body.tmOrderNumber !== undefined) {
      updateData.tmOrderNumber = body.tmOrderNumber;
    }

    // Account/Card linking
    if (body.accountId !== undefined) {
      updateData.accountId = body.accountId;
    }
    if (body.cardId !== undefined) {
      updateData.cardId = body.cardId;
    }
    if (body.cardLast4 !== undefined) {
      updateData.cardLast4 = body.cardLast4;
    }

    const job = await prisma.checkoutJob.update({
      where: { id },
      data: updateData,
      include: {
        account: {
          select: { id: true, email: true },
        },
        card: {
          select: { id: true, cardNumber: true, cardType: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    console.error("Error updating checkout job:", error);
    return NextResponse.json(
      { error: "Failed to update checkout job" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/checkout/jobs/[id]
 * Delete a checkout job (only if not imported)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const existing = await prisma.checkoutJob.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Checkout job not found" },
        { status: 404 }
      );
    }

    if (existing.imported) {
      return NextResponse.json(
        { error: "Cannot delete an imported checkout job" },
        { status: 400 }
      );
    }

    await prisma.checkoutJob.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Checkout job deleted",
    });
  } catch (error) {
    console.error("Error deleting checkout job:", error);
    return NextResponse.json(
      { error: "Failed to delete checkout job" },
      { status: 500 }
    );
  }
}
