import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseEmailCsvFile } from "@/lib/importers";
import { AccountStatus, PurchaseStatus } from "@prisma/client";
import { assignPoNumber } from "@/lib/services/pos-sync";
import { formatSSE, getStreamHeaders } from "@/lib/utils/streaming";

// Conflict types for card-email matching issues
export type ConflictType = "CARD_NOT_FOUND" | "CARD_AMBIGUOUS" | "CARD_ACCOUNT_MISMATCH";

export interface ImportConflict {
  row: number;
  email: string;
  cardLast4: string;
  type: ConflictType;
  existingAccountEmail?: string;
  existingCardId?: string;
  purchaseId?: string; // If created without card link
  tmOrderNumber: string;
}

export interface ImportDuplicate {
  row: number;
  tmOrderNumber: string;
  existingPurchaseId: string;
  hasChanges: boolean;
  changes?: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
}

export interface ImportSummary {
  purchasesCreated: number;
  purchasesSkipped: number;
  eventsCreated: number;
  eventsMatched: number;
  accountsCreated: number;
  cardsLinked: number;
}

export interface ImportResult {
  success: boolean;
  summary: ImportSummary;
  conflicts: ImportConflict[];
  duplicates: ImportDuplicate[];
  warnings: { row: number; message: string }[];
  errors: { row: number; message: string }[];
}

/**
 * Parse event date string to Date object
 * Format: "Sun · Aug 02, 2026 · 8:00 PM"
 */
function parseEventDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  try {
    // Split by " · " and get date parts (skip day of week)
    const parts = dateStr.split(" · ");
    if (parts.length >= 2) {
      // Join all parts except the first (day of week)
      const dateTimeStr = parts.slice(1).join(" ");
      const date = new Date(dateTimeStr);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compare two values and return change info if different
 */
function compareValues(
  field: string,
  oldVal: string | number | null | undefined,
  newVal: string | number | null | undefined
): { field: string; oldValue: string; newValue: string } | null {
  const oldStr = String(oldVal ?? "");
  const newStr = String(newVal ?? "");
  if (oldStr !== newStr) {
    return { field, oldValue: oldStr, newValue: newStr };
  }
  return null;
}

/**
 * Normalize venue name for comparison
 * Removes common suffixes like ", City, State" and extra whitespace
 */
function normalizeVenue(venue: string): string {
  if (!venue) return "";
  // Take just the venue name part (before any " — " or ", ")
  const parts = venue.split(/\s*[—,]\s*/);
  return parts[0].trim().toLowerCase();
}

/**
 * Normalize event name for comparison
 * Handles multi-line event names and extra whitespace
 */
function normalizeEventName(name: string): string {
  if (!name) return "";
  // Replace newlines with spaces and normalize whitespace
  return name.replace(/\n+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Find matching event by fuzzy matching on name, venue, and date
 */
async function findMatchingEvent(
  eventName: string,
  venue: string,
  eventDateStr: string
): Promise<{ id: string; tmEventId: string } | null> {
  const normalizedName = normalizeEventName(eventName);
  const normalizedVenue = normalizeVenue(venue);
  const parsedDate = parseEventDate(eventDateStr);

  // Get all events and filter in memory for more flexible matching
  const allEvents = await prisma.event.findMany({
    select: {
      id: true,
      tmEventId: true,
      eventName: true,
      venue: true,
      eventDate: true,
      eventDateRaw: true,
    },
  });

  for (const event of allEvents) {
    const eventNormalizedName = normalizeEventName(event.eventName);
    const eventNormalizedVenue = normalizeVenue(event.venue || "");

    // Check name match (contains check for flexibility)
    const nameMatch =
      eventNormalizedName.includes(normalizedName) ||
      normalizedName.includes(eventNormalizedName) ||
      // Handle partial matches like "Shane Gillis Live" matching "Shane Gillis Live United Center Pre-show Party..."
      eventNormalizedName.split(" ").slice(0, 3).join(" ") === normalizedName.split(" ").slice(0, 3).join(" ");

    if (!nameMatch) continue;

    // Check venue match
    const venueMatch =
      eventNormalizedVenue.includes(normalizedVenue) ||
      normalizedVenue.includes(eventNormalizedVenue);

    if (!venueMatch) continue;

    // Check date match (same day)
    if (parsedDate && event.eventDate) {
      const eventDate = new Date(event.eventDate);
      const sameDay =
        parsedDate.getFullYear() === eventDate.getFullYear() &&
        parsedDate.getMonth() === eventDate.getMonth() &&
        parsedDate.getDate() === eventDate.getDate();
      
      if (sameDay) {
        return { id: event.id, tmEventId: event.tmEventId };
      }
    } else if (event.eventDateRaw) {
      // Fallback: check if date strings contain similar date parts
      // Regex to extract month, day, year from date strings like "Aug 02, 2026" or "Aug 2, 2026"
      const csvDateParts = eventDateStr.match(/(\w+)\s+(\d+),?\s+(\d{4})/);
      const eventDateParts = event.eventDateRaw.match(/(\w+)\s+(\d+),?\s+(\d{4})/);
      if (csvDateParts && eventDateParts) {
        // Compare month name (case-insensitive) and numeric day/year values
        const csvMonth = csvDateParts[1].toLowerCase();
        const eventMonth = eventDateParts[1].toLowerCase();
        const csvDay = parseInt(csvDateParts[2], 10);
        const eventDay = parseInt(eventDateParts[2], 10);
        const csvYear = parseInt(csvDateParts[3], 10);
        const eventYear = parseInt(eventDateParts[3], 10);
        
        if (csvMonth === eventMonth && csvDay === eventDay && csvYear === eventYear) {
          return { id: event.id, tmEventId: event.tmEventId };
        }
      }
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const streaming = formData.get("streaming") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const parseResult = parseEmailCsvFile(content);

    if (parseResult.data.length === 0) {
      return NextResponse.json(
        {
          error: "No valid entries found in file",
          parseErrors: parseResult.errors.slice(0, 20),
        },
        { status: 400 }
      );
    }

    // If streaming, return SSE with progress updates
    // Note: Full conflict/duplicate handling still happens, but we stream progress
    if (streaming) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const total = parseResult.data.length;
          let created = 0;
          let skipped = 0;

          controller.enqueue(encoder.encode(formatSSE({
            type: "start",
            total,
            label: `Processing ${total} email receipts...`,
          })));

          const eventCache = new Map<string, string | null>();
          const accountCache = new Map<string, string>();

          for (let i = 0; i < parseResult.data.length; i++) {
            const entry = parseResult.data[i];
            try {
              // Check for existing
              const existingByOrderNum = await prisma.purchase.findFirst({
                where: { tmOrderNumber: entry.tmOrderNumber },
              });

              if (existingByOrderNum) {
                skipped++;
              } else {
                // Get or create account
                let accountId = accountCache.get(entry.email);
                if (!accountId) {
                  let account = await prisma.account.findUnique({ where: { email: entry.email } });
                  if (!account) {
                    account = await prisma.account.create({
                      data: { email: entry.email, status: AccountStatus.ACTIVE },
                    });
                  }
                  accountId = account.id;
                  accountCache.set(entry.email, accountId);
                }

                // Find matching event
                const eventKey = `${entry.eventName}|${entry.venue}|${entry.eventDate}`;
                let eventId = eventCache.has(eventKey) ? eventCache.get(eventKey) : undefined;
                if (eventId === undefined) {
                  const matchedEvent = await findMatchingEvent(entry.eventName, entry.venue, entry.eventDate);
                  eventId = matchedEvent?.id || null;
                  eventCache.set(eventKey, eventId);
                }

                // Create purchase
                const purchase = await prisma.purchase.create({
                  data: {
                    accountId,
                    eventId: eventId || null,
                    cardId: null,
                    cardLast4: entry.cardLast4 || null,
                    tmOrderNumber: entry.tmOrderNumber,
                    status: PurchaseStatus.SUCCESS,
                    quantity: entry.quantity,
                    priceEach: entry.quantity > 0 ? entry.totalPrice / entry.quantity : null,
                    totalPrice: entry.totalPrice,
                    section: entry.section || null,
                    row: entry.row || null,
                    seats: entry.seats || null,
                    attemptCount: 1,
                  },
                });

                try {
                  await assignPoNumber(purchase.id);
                } catch {
                  // Non-fatal
                }
                created++;
              }
            } catch (error) {
              skipped++;
            }

            controller.enqueue(encoder.encode(formatSSE({
              type: "progress",
              current: i + 1,
              total,
              label: entry.email,
              success: created,
              failed: skipped,
            })));
          }

          controller.enqueue(encoder.encode(formatSSE({
            type: "complete",
            current: total,
            total,
            success: created,
            failed: skipped,
            message: `Created ${created} purchases, skipped ${skipped}`,
          })));
          controller.close();
        },
      });
      return new Response(stream, { headers: getStreamHeaders() });
    }

    // Non-streaming fallback with full conflict handling
    const summary: ImportSummary = {
      purchasesCreated: 0,
      purchasesSkipped: 0,
      eventsCreated: 0,
      eventsMatched: 0,
      accountsCreated: 0,
      cardsLinked: 0,
    };
    const conflicts: ImportConflict[] = [];
    const duplicates: ImportDuplicate[] = [];
    const warnings = [...parseResult.warnings];
    const errors = [...parseResult.errors];

    // Cache for event lookups (eventKey -> prisma event id)
    const eventCache = new Map<string, string | null>();

    // Cache for account lookups
    const accountCache = new Map<string, string>();

    // Now process each entry
    for (const entry of parseResult.data) {
      try {
        // Check for existing purchase by TM order number first
        const existingByOrderNum = await prisma.purchase.findFirst({
          where: { tmOrderNumber: entry.tmOrderNumber },
        });

        if (existingByOrderNum) {
          // Compare to see if there are changes
          const changes: { field: string; oldValue: string; newValue: string }[] = [];
          
          const quantityChange = compareValues("quantity", existingByOrderNum.quantity, entry.quantity);
          if (quantityChange) changes.push(quantityChange);
          
          const totalChange = compareValues("totalPrice", existingByOrderNum.totalPrice?.toNumber(), entry.totalPrice);
          if (totalChange) changes.push(totalChange);
          
          const sectionChange = compareValues("section", existingByOrderNum.section, entry.section);
          if (sectionChange) changes.push(sectionChange);
          
          const rowChange = compareValues("row", existingByOrderNum.row, entry.row);
          if (rowChange) changes.push(rowChange);
          
          const seatsChange = compareValues("seats", existingByOrderNum.seats, entry.seats);
          if (seatsChange) changes.push(seatsChange);

          duplicates.push({
            row: entry.rowNumber,
            tmOrderNumber: entry.tmOrderNumber,
            existingPurchaseId: existingByOrderNum.id,
            hasChanges: changes.length > 0,
            changes: changes.length > 0 ? changes : undefined,
          });
          summary.purchasesSkipped++;
          continue;
        }

        // Get or create account
        let accountId = accountCache.get(entry.email);
        if (!accountId) {
          let account = await prisma.account.findUnique({
            where: { email: entry.email },
          });

          if (!account) {
            account = await prisma.account.create({
              data: {
                email: entry.email,
                status: AccountStatus.ACTIVE,
              },
            });
            summary.accountsCreated++;
          }
          accountId = account.id;
          accountCache.set(entry.email, accountId);
        }

        // Find matching event using fuzzy matching
        const eventKey = `${entry.eventName}|${entry.venue}|${entry.eventDate}`;
        let eventId: string | null = null;
        
        if (eventCache.has(eventKey)) {
          eventId = eventCache.get(eventKey) || null;
        } else {
          const matchedEvent = await findMatchingEvent(entry.eventName, entry.venue, entry.eventDate);
          if (matchedEvent) {
            eventId = matchedEvent.id;
            summary.eventsMatched++;
          } else {
            // No matching event found - create a warning but don't create a new event
            // The user should sync events from queue data first
            warnings.push({
              row: entry.rowNumber,
              message: `No matching event found for "${entry.eventName}" at ${entry.venue}`,
            });
          }
          eventCache.set(eventKey, eventId);
        }

        // Fallback duplicate detection: check by account + event + section/row/seats
        if (eventId) {
          const existingBySeat = await prisma.purchase.findFirst({
            where: {
              accountId,
              eventId,
              section: entry.section || null,
              row: entry.row || null,
              seats: entry.seats || null,
            },
          });

          if (existingBySeat) {
            duplicates.push({
              row: entry.rowNumber,
              tmOrderNumber: entry.tmOrderNumber,
              existingPurchaseId: existingBySeat.id,
              hasChanges: !existingBySeat.tmOrderNumber, // Has changes if tmOrderNumber was missing
              changes: !existingBySeat.tmOrderNumber 
                ? [{ field: "tmOrderNumber", oldValue: "", newValue: entry.tmOrderNumber }]
                : undefined,
            });
            summary.purchasesSkipped++;
            continue;
          }
        }

        // Try to find card by last 4 digits
        let cardId: string | null = null;
        let conflictDetected = false;

        if (entry.cardLast4) {
          // Find cards matching the last 4 digits
          const matchingCards = await prisma.card.findMany({
            where: {
              cardNumber: { endsWith: entry.cardLast4 },
              deletedAt: null, // Only active cards
            },
            include: {
              account: {
                select: { id: true, email: true },
              },
            },
          });

          if (matchingCards.length === 0) {
            // Card not found - create conflict but still create purchase
            conflicts.push({
              row: entry.rowNumber,
              email: entry.email,
              cardLast4: entry.cardLast4,
              type: "CARD_NOT_FOUND",
              tmOrderNumber: entry.tmOrderNumber,
            });
            conflictDetected = true;
          } else if (matchingCards.length === 1) {
            // Exactly one card matches
            const card = matchingCards[0];

            if (!card.accountId) {
              // Card is unlinked - auto-link it to this account
              await prisma.card.update({
                where: { id: card.id },
                data: { accountId },
              });
              cardId = card.id;
              summary.cardsLinked++;
            } else if (card.accountId === accountId) {
              // Card is already linked to the correct account
              cardId = card.id;
            } else {
              // Card is linked to a different account - conflict!
              conflicts.push({
                row: entry.rowNumber,
                email: entry.email,
                cardLast4: entry.cardLast4,
                type: "CARD_ACCOUNT_MISMATCH",
                existingAccountEmail: card.account?.email,
                existingCardId: card.id,
                tmOrderNumber: entry.tmOrderNumber,
              });
              conflictDetected = true;
            }
          } else {
            // Multiple cards match the last 4 digits
            // First, try to find one that's linked to THIS account
            const cardsForThisAccount = matchingCards.filter(c => c.accountId === accountId);
            
            if (cardsForThisAccount.length === 1) {
              // Found exactly one card linked to this account - use it
              cardId = cardsForThisAccount[0].id;
            } else if (cardsForThisAccount.length > 1) {
              // Multiple cards with same last 4 on same account - truly ambiguous
              conflicts.push({
                row: entry.rowNumber,
                email: entry.email,
                cardLast4: entry.cardLast4,
                type: "CARD_AMBIGUOUS",
                tmOrderNumber: entry.tmOrderNumber,
              });
              conflictDetected = true;
            } else {
              // No cards linked to this account - check for unlinked cards
              const unlinkedCards = matchingCards.filter(c => !c.accountId);
              
              if (unlinkedCards.length === 1) {
                // One unlinked card - auto-link it
                await prisma.card.update({
                  where: { id: unlinkedCards[0].id },
                  data: { accountId },
                });
                cardId = unlinkedCards[0].id;
                summary.cardsLinked++;
              } else if (unlinkedCards.length > 1) {
                // Multiple unlinked cards - ambiguous
                conflicts.push({
                  row: entry.rowNumber,
                  email: entry.email,
                  cardLast4: entry.cardLast4,
                  type: "CARD_AMBIGUOUS",
                  tmOrderNumber: entry.tmOrderNumber,
                });
                conflictDetected = true;
              } else {
                // All cards are linked to other accounts
                // Check if any single card matches by being linked to an account with matching email
                // This shouldn't happen if the data is consistent, so flag as mismatch
                conflicts.push({
                  row: entry.rowNumber,
                  email: entry.email,
                  cardLast4: entry.cardLast4,
                  type: "CARD_ACCOUNT_MISMATCH",
                  existingAccountEmail: matchingCards[0].account?.email,
                  existingCardId: matchingCards[0].id,
                  tmOrderNumber: entry.tmOrderNumber,
                });
                conflictDetected = true;
              }
            }
          }
        }

        // Create the purchase (with or without card link)
        const purchase = await prisma.purchase.create({
          data: {
            accountId,
            eventId: eventId || null,
            cardId: cardId,
            cardLast4: entry.cardLast4 || null,
            tmOrderNumber: entry.tmOrderNumber,
            status: PurchaseStatus.SUCCESS, // Assuming all email receipts are successful purchases
            quantity: entry.quantity,
            priceEach: entry.quantity > 0 ? entry.totalPrice / entry.quantity : null,
            totalPrice: entry.totalPrice,
            section: entry.section || null,
            row: entry.row || null,
            seats: entry.seats || null,
            attemptCount: 1,
          },
        });

        // Automatically assign a PO number to successful purchases
        try {
          await assignPoNumber(purchase.id);
        } catch (poError) {
          console.warn(`[EmailCSV Import] Failed to assign PO number for purchase ${purchase.id}:`, poError);
          // Non-fatal - continue with import
        }

        // If there was a conflict, add the purchase ID so user can update it later
        if (conflictDetected && conflicts.length > 0) {
          const lastConflict = conflicts[conflicts.length - 1];
          if (lastConflict.tmOrderNumber === entry.tmOrderNumber) {
            lastConflict.purchaseId = purchase.id;
          }
        }

        summary.purchasesCreated++;
      } catch (error) {
        errors.push({
          row: entry.rowNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result: ImportResult = {
      success: true,
      summary,
      conflicts,
      duplicates,
      warnings,
      errors,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Email CSV import error:", error);
    return NextResponse.json(
      { error: "Failed to import file", details: String(error) },
      { status: 500 }
    );
  }
}
