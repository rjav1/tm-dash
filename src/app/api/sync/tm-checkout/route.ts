import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parsePurchasesFile, parseProfilesFile } from "@/lib/importers";
import { AccountStatus, PurchaseStatus } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";

const TM_CHECKOUT_PATH = process.env.TM_CHECKOUT_PATH || "c:\\Users\\Rahil\\Downloads\\tm-checkout";

/**
 * POST /api/sync/tm-checkout
 * Sync purchases and profiles from tm-checkout directory
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { syncPurchases = true, syncProfiles = true, exportFile } = body;

    const results = {
      purchases: { 
        imported: 0, 
        skipped: 0, 
        eventsCreated: 0,
        successCount: 0,
        failedCount: 0,
        totalRevenue: 0,
        errors: [] as string[] 
      },
      profiles: { 
        accounts: 0, 
        cards: 0, 
        errors: [] as string[] 
      },
    };

    // Sync profiles (cards linked to accounts)
    if (syncProfiles) {
      const profilesPath = path.join(TM_CHECKOUT_PATH, "discord-bot", "extensions", "profiles.csv");
      
      try {
        const content = await fs.readFile(profilesPath, "utf-8");
        const profiles = parseProfilesFile(content);

        for (const profile of profiles) {
          try {
            // Get or create account
            const account = await prisma.account.upsert({
              where: { email: profile.email },
              create: {
                email: profile.email,
                status: AccountStatus.ACTIVE,
              },
              update: {},
            });

            // Create or update card by cardNumber (accounts can have multiple cards)
            await prisma.card.upsert({
              where: { cardNumber: profile.cardNumber },
              create: {
                accountId: account.id,
                profileName: profile.profileName,
                cardType: profile.cardType,
                cardNumber: profile.cardNumber,
                expMonth: profile.expMonth,
                expYear: profile.expYear,
                cvv: profile.cvv,
                billingName: profile.billingName,
                billingPhone: profile.billingPhone,
                billingAddress: profile.billingAddress,
                billingZip: profile.billingZip,
                billingCity: profile.billingCity,
                billingState: profile.billingState,
              },
              update: {
                accountId: account.id,
                profileName: profile.profileName,
                cardType: profile.cardType,
                expMonth: profile.expMonth,
                expYear: profile.expYear,
                cvv: profile.cvv,
                billingName: profile.billingName,
                billingPhone: profile.billingPhone,
                billingAddress: profile.billingAddress,
                billingZip: profile.billingZip,
                billingCity: profile.billingCity,
                billingState: profile.billingState,
              },
            });

            results.profiles.accounts++;
            results.profiles.cards++;
          } catch (error) {
            results.profiles.errors.push(`${profile.email}: ${error}`);
          }
        }
      } catch {
        results.profiles.errors.push("profiles.csv not found");
      }
    }

    // Sync purchases from exports
    if (syncPurchases) {
      const exportsDir = path.join(TM_CHECKOUT_PATH, "discord-bot", "exports");
      
      try {
        // Get list of export files
        const files = await fs.readdir(exportsDir);
        const csvFiles = exportFile 
          ? [exportFile] 
          : files.filter(f => f.endsWith(".csv") && f.startsWith("export_"));

        // Sort by date (newest first)
        csvFiles.sort().reverse();

        // Process each export file
        for (const csvFile of csvFiles) {
          try {
            const filePath = path.join(exportsDir, csvFile);
            const content = await fs.readFile(filePath, "utf-8");
            const parseResult = parsePurchasesFile(content);

            // Create events first
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

            for (const [eventId, eventData] of uniqueEvents.entries()) {
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
                results.purchases.eventsCreated++;
              } else {
                // Update existing event if it has placeholder name or missing data
                const needsUpdate = 
                  existing.eventName.startsWith("Event ") ||
                  (!existing.venue && eventData.venue) ||
                  (!existing.eventDateRaw && eventData.date);

                if (needsUpdate) {
                  await prisma.event.update({
                    where: { tmEventId: eventId },
                    data: {
                      eventName: eventData.name || existing.eventName,
                      venue: eventData.venue || existing.venue,
                      eventDateRaw: eventData.date || existing.eventDateRaw,
                      eventDate: parseEventDate(eventData.date) || existing.eventDate,
                    },
                  });
                }
              }
            }

            // Import purchases
            for (const entry of parseResult.data) {
              try {
                // Skip if already exists
                const existing = await prisma.purchase.findUnique({
                  where: { externalJobId: entry.jobId },
                });

                if (existing) {
                  results.purchases.skipped++;
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

                // Get card by last 4 - only match cards on the SAME account
                const cardLast4 = entry.cardLast4?.trim() || null;
                let cardId: string | undefined;
                if (cardLast4) {
                  const card = await prisma.card.findFirst({
                    where: {
                      accountId: account.id,
                      cardNumber: { endsWith: cardLast4 },
                    },
                  });
                  cardId = card?.id;
                }

                await prisma.purchase.create({
                  data: {
                    accountId: account.id,
                    eventId: event?.id,
                    cardId,
                    cardLast4, // Store for re-linking purposes
                    externalJobId: entry.jobId,
                    status: entry.status === "SUCCESS" ? PurchaseStatus.SUCCESS : PurchaseStatus.FAILED,
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

                results.purchases.imported++;
                
                if (entry.status === "SUCCESS") {
                  results.purchases.successCount++;
                  results.purchases.totalRevenue += entry.totalPrice;
                } else {
                  results.purchases.failedCount++;
                }
              } catch (error) {
                results.purchases.errors.push(`Job ${entry.jobId}: ${error}`);
                results.purchases.skipped++;
              }
            }
          } catch (error) {
            results.purchases.errors.push(`File ${csvFile}: ${error}`);
          }
        }
      } catch {
        results.purchases.errors.push("exports directory not found");
      }
    }

    return NextResponse.json({
      success: true,
      results,
      paths: {
        checkout: TM_CHECKOUT_PATH,
      },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync from tm-checkout", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync/tm-checkout
 * Check available export files
 */
export async function GET() {
  try {
    const exportsDir = path.join(TM_CHECKOUT_PATH, "discord-bot", "exports");
    const files: { name: string; size: number; modified: string }[] = [];

    try {
      const dirFiles = await fs.readdir(exportsDir);
      
      for (const file of dirFiles) {
        if (file.endsWith(".csv")) {
          const filePath = path.join(exportsDir, file);
          const stats = await fs.stat(filePath);
          files.push({
            name: file,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        }
      }
    } catch {
      // Directory doesn't exist
    }

    // Sort by modified date (newest first)
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return NextResponse.json({
      checkoutPath: TM_CHECKOUT_PATH,
      exportFiles: files,
      profilesExists: await fileExists(path.join(TM_CHECKOUT_PATH, "discord-bot", "extensions", "profiles.csv")),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to check files", details: String(error) },
      { status: 500 }
    );
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

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

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}
