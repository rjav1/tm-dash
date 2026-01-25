import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parsePurchasesFile } from "@/lib/importers";
import { AccountStatus, PurchaseStatus } from "@prisma/client";

interface ImportError {
  jobId?: string;
  email?: string;
  reason: string;
  details?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const parseResult = parsePurchasesFile(content);

    if (parseResult.data.length === 0) {
      return NextResponse.json(
        { 
          error: "No valid entries found in file",
          parseErrors: parseResult.errors.slice(0, 20),
        },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;
    let eventsCreated = 0;
    const importErrors: ImportError[] = [];

    // Pre-create all events first for efficiency
    // Use eventId (from Discord webhook if available, otherwise generated)
    const uniqueEvents = new Map<string, { name: string; date: string; venue: string }>();
    for (const entry of parseResult.data) {
      if (!uniqueEvents.has(entry.eventId)) {
        uniqueEvents.set(entry.eventId, {
          name: entry.eventName,
          date: entry.eventDate,
          venue: entry.venue,
        });
      }
    }

    // Create/upsert all events
    for (const [eventId, eventData] of uniqueEvents.entries()) {
      try {
        const existing = await prisma.event.findUnique({
          where: { tmEventId: eventId },
        });

        if (!existing) {
          await prisma.event.create({
            data: {
              tmEventId: eventId,
              eventName: eventData.name,
              venue: eventData.venue,
              eventDateRaw: eventData.date,
              eventDate: parseEventDate(eventData.date),
            },
          });
          eventsCreated++;
        }
      } catch (error) {
        console.error(`Failed to create event ${eventId}:`, error);
      }
    }

    // Now import purchases
    for (const entry of parseResult.data) {
      try {
        // Check if purchase already exists
        const existing = await prisma.purchase.findUnique({
          where: { externalJobId: entry.jobId },
        });

        if (existing) {
          importErrors.push({
            jobId: entry.jobId,
            email: entry.email,
            reason: "Duplicate",
            details: "Purchase with this Job ID already exists",
          });
          skipped++;
          continue;
        }

        // Get or create account
        const account = await prisma.account.upsert({
          where: { email: entry.email },
          create: {
            email: entry.email,
            status: AccountStatus.ACTIVE,
          },
          update: {},
        });

        // Get event (using eventId from Discord webhook or generated)
        const event = await prisma.event.findUnique({
          where: { tmEventId: entry.eventId },
        });

        // Get or create card
        let cardId: string | undefined;
        const cardLast4 = entry.cardLast4?.trim() || null;
        
        // If we have full card data in the CSV, create or find the card
        if (entry.cardNumber && entry.cardNumber.length >= 13) {
          // Try to find existing card by full card number
          let card = await prisma.card.findFirst({
            where: {
              cardNumber: entry.cardNumber,
            },
          });
          
          if (!card) {
            // Create the card and link to account
            card = await prisma.card.create({
              data: {
                accountId: account.id,
                profileName: entry.profileId || `Card ${entry.cardNumber.slice(-4)}`,
                cardNumber: entry.cardNumber,
                cardType: entry.cardType || "Unknown",
                expMonth: entry.expMonth || "",
                expYear: entry.expYear || "",
                cvv: entry.cvv || "",
                billingName: entry.billingName || "",
                billingPhone: entry.billingPhone || "",
                billingAddress: entry.billingAddress || "",
                billingZip: entry.billingZip || "",
                billingCity: entry.billingCity || "",
                billingState: entry.billingState || "",
              },
            });
          } else if (!card.accountId) {
            // Card exists but not linked to an account - link it
            await prisma.card.update({
              where: { id: card.id },
              data: { accountId: account.id },
            });
          }
          
          cardId = card.id;
        } else if (cardLast4) {
          // Fallback: try to match by last 4 digits on same account
          const card = await prisma.card.findFirst({
            where: {
              accountId: account.id,
              cardNumber: { endsWith: cardLast4 },
            },
          });
          cardId = card?.id;
        }

        // Parse dates
        const parseDate = (dateStr: string): Date | null => {
          if (!dateStr) return null;
          const date = new Date(dateStr);
          return isNaN(date.getTime()) ? null : date;
        };

        await prisma.purchase.create({
          data: {
            accountId: account.id,
            eventId: event?.id,
            cardId,
            cardLast4, // Store for re-linking purposes
            externalJobId: entry.jobId,
            status:
              entry.status === "SUCCESS"
                ? PurchaseStatus.SUCCESS
                : PurchaseStatus.FAILED,
            errorCode: entry.errorCode || null,
            errorMessage: entry.errorMessage || null,
            quantity: entry.quantity,
            priceEach: entry.priceEach,
            totalPrice: entry.totalPrice,
            section: entry.section || null,
            row: entry.row || null,
            seats: entry.seats || null,
            checkoutUrl: entry.targetUrl || null,
            confirmationUrl: entry.finalUrl || null,
            createdAt: parseDate(entry.createdAt) || new Date(),
            startedAt: parseDate(entry.startedAt),
            completedAt: parseDate(entry.completedAt),
            attemptCount: entry.attemptCount,
          },
        });

        imported++;
      } catch (error) {
        importErrors.push({
          jobId: entry.jobId,
          email: entry.email,
          reason: "Database error",
          details: error instanceof Error ? error.message : String(error),
        });
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      eventsCreated,
      total: parseResult.data.length,
      parseErrors: parseResult.errors.length,
      importErrors: importErrors.slice(0, 50),
      stats: parseResult.stats,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import file", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Parse event date string to Date object
 * Format: "October 08, 2026 at 02:00 AM"
 */
function parseEventDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  try {
    // Remove "at" and parse
    const cleaned = dateStr.replace(" at ", " ");
    const date = new Date(cleaned);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}
