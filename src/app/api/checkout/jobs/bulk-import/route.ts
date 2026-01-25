import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PurchaseStatus } from "@prisma/client";

interface ImportResult {
  jobId: string;
  success: boolean;
  purchaseId?: string;
  error?: string;
}

/**
 * POST /api/checkout/jobs/bulk-import
 * Import multiple successful checkout jobs as Purchase records
 * 
 * Body:
 * - jobIds: string[] (optional, specific job IDs to import)
 * - importAll: boolean (optional, import all non-imported successful jobs)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobIds, importAll } = body;

    // Determine which jobs to import
    let jobs;
    if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
      jobs = await prisma.checkoutJob.findMany({
        where: {
          id: { in: jobIds },
          status: "SUCCESS",
          imported: false,
        },
        include: {
          account: true,
          card: true,
        },
      });
    } else if (importAll) {
      jobs = await prisma.checkoutJob.findMany({
        where: {
          status: "SUCCESS",
          imported: false,
        },
        include: {
          account: true,
          card: true,
        },
        orderBy: { createdAt: "asc" },
      });
    } else {
      return NextResponse.json(
        { error: "Provide either jobIds array or set importAll to true" },
        { status: 400 }
      );
    }

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No eligible jobs to import",
        imported: 0,
        failed: 0,
        results: [],
      });
    }

    const results: ImportResult[] = [];
    let imported = 0;
    let failed = 0;
    let eventsCreated = 0;

    // Pre-create all unique events for efficiency
    const eventMap = new Map<string, { name: string; date: string | null; venue: string | null }>();
    for (const job of jobs) {
      if (job.tmEventId && !eventMap.has(job.tmEventId)) {
        eventMap.set(job.tmEventId, {
          name: job.eventName || "Unknown Event",
          date: job.eventDate,
          venue: job.venue,
        });
      }
    }

    // Create/upsert events
    for (const [tmEventId, eventData] of eventMap.entries()) {
      try {
        const existing = await prisma.event.findUnique({
          where: { tmEventId },
        });
        if (!existing) {
          await prisma.event.create({
            data: {
              tmEventId,
              eventName: eventData.name,
              venue: eventData.venue || undefined,
              eventDateRaw: eventData.date || undefined,
              eventDate: eventData.date ? parseEventDate(eventData.date) : null,
            },
          });
          eventsCreated++;
        }
      } catch (error) {
        console.error(`Failed to create event ${tmEventId}:`, error);
      }
    }

    // Import each job
    for (const job of jobs) {
      try {
        // Check for duplicate externalJobId
        const existingPurchase = await prisma.purchase.findUnique({
          where: { externalJobId: job.id },
        });

        if (existingPurchase) {
          await prisma.checkoutJob.update({
            where: { id: job.id },
            data: {
              imported: true,
              importedAt: new Date(),
              purchaseId: existingPurchase.id,
            },
          });
          results.push({
            jobId: job.id,
            success: true,
            purchaseId: existingPurchase.id,
          });
          imported++;
          continue;
        }

        // Get or create account
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
          results.push({
            jobId: job.id,
            success: false,
            error: "No account associated with job",
          });
          failed++;
          continue;
        }

        // Get event ID
        let eventId: string | undefined;
        if (job.tmEventId) {
          const event = await prisma.event.findUnique({
            where: { tmEventId: job.tmEventId },
          });
          eventId = event?.id;
        }

        // Create purchase
        const purchase = await prisma.purchase.create({
          data: {
            accountId,
            eventId,
            cardId: job.cardId,
            externalJobId: job.id,
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

        // Mark job as imported
        await prisma.checkoutJob.update({
          where: { id: job.id },
          data: {
            imported: true,
            importedAt: new Date(),
            purchaseId: purchase.id,
          },
        });

        results.push({
          jobId: job.id,
          success: true,
          purchaseId: purchase.id,
        });
        imported++;
      } catch (error) {
        console.error(`Failed to import job ${job.id}:`, error);
        results.push({
          jobId: job.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${imported} of ${jobs.length} jobs`,
      imported,
      failed,
      eventsCreated,
      results,
    });
  } catch (error) {
    console.error("Error in bulk import:", error);
    return NextResponse.json(
      { error: "Failed to import checkout jobs" },
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
