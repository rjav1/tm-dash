/**
 * Parser for tm-checkout export CSV files
 * Format: Job ID,Status,Profile ID,Card Last 4,Event Name,Event Date,Venue,Quantity,Price Each,Total Price,Section,Row,Seats,Account Email,Error Code,Error Message,Target URL,Final URL,Created At,Started At,Completed At,Attempt Count
 */

import Papa from "papaparse";
import crypto from "crypto";

export interface PurchaseEntry {
  jobId: string;
  status: "SUCCESS" | "FAILED";
  profileId: string;
  cardLast4: string;
  eventName: string;
  eventDate: string;
  venue: string;
  // Event ID - from Discord webhook if available, otherwise generated
  eventId: string;
  // Generated event ID (used when eventId not provided)
  generatedEventId: string;
  quantity: number;
  priceEach: number;
  totalPrice: number;
  section: string;
  row: string;
  seats: string;
  email: string;
  errorCode: string;
  errorMessage: string;
  targetUrl: string;
  finalUrl: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  attemptCount: number;
  // Card details (optional - may be in extended exports)
  cardNumber?: string;
  cardType?: string;
  expMonth?: string;
  expYear?: string;
  cvv?: string;
  // Billing details (optional)
  billingName?: string;
  billingPhone?: string;
  billingAddress?: string;
  billingZip?: string;
  billingCity?: string;
  billingState?: string;
  // Currency (optional - new field)
  currency?: string;
}

export interface ParseError {
  row: number;
  field?: string;
  message: string;
  rawData?: string;
}

export interface ParseResult<T> {
  data: T[];
  errors: ParseError[];
  stats: {
    total: number;
    parsed: number;
    errored: number;
    successCount: number;
    failedCount: number;
    totalRevenue: number;
  };
}

/**
 * Generate a deterministic event ID from event details
 * This ensures the same event always gets the same ID
 */
function generateEventId(eventName: string, eventDate: string, venue: string): string {
  const normalizedName = eventName.toLowerCase().trim();
  const normalizedVenue = venue.toLowerCase().trim();
  // Don't include time in the hash, just the date part
  const datePart = eventDate.split(" at ")[0]?.trim() || eventDate;
  
  const input = `${normalizedName}|${datePart}|${normalizedVenue}`;
  const hash = crypto.createHash("md5").update(input).digest("hex");
  
  // Return first 16 chars of hash (same length as TM event IDs)
  return hash.substring(0, 16).toUpperCase();
}

/**
 * Parse currency string to number
 * Handles formats like "$672.60", "672.60", "$1,234.56"
 */
function parseCurrency(val: string): number {
  if (!val || val.trim() === "") return 0;
  // Remove $ and commas, then parse
  const cleaned = val.replace(/[$,]/g, "").trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Convert currency to USD
 * CAD to USD rate: approximately 0.71 (Jan 2026)
 * Add more currencies as needed
 */
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1.0,
  CAD: 0.71,
  // Add more currencies here as needed
};

function convertToUsd(amount: number, currency: string | undefined): number {
  if (!currency || currency.toUpperCase() === "USD") {
    return amount;
  }
  
  const rate = CURRENCY_TO_USD[currency.toUpperCase()];
  if (rate) {
    return Math.round(amount * rate * 100) / 100; // Round to 2 decimal places
  }
  
  // Unknown currency - return as-is but log warning
  console.warn(`Unknown currency: ${currency}, not converting`);
  return amount;
}

export function parsePurchasesFile(content: string): ParseResult<PurchaseEntry> {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const entries: PurchaseEntry[] = [];
  const errors: ParseError[] = [];
  let rowIndex = 1;
  let successCount = 0;
  let failedCount = 0;
  let totalRevenue = 0;

  for (const row of result.data) {
    rowIndex++;

    const email = row["Account Email"]?.trim().toLowerCase();
    const jobId = row["Job ID"]?.trim();

    // Skip rows without email or job id
    if (!email) {
      errors.push({
        row: rowIndex,
        field: "email",
        message: "Missing Account Email",
        rawData: JSON.stringify(row),
      });
      continue;
    }

    if (!jobId) {
      errors.push({
        row: rowIndex,
        field: "jobId",
        message: "Missing Job ID",
        rawData: JSON.stringify(row),
      });
      continue;
    }

    const eventName = row["Event Name"]?.trim() || "";
    const eventDate = row["Event Date"]?.trim() || "";
    const venue = row["Venue"]?.trim() || "";
    
    // Use Event ID from CSV if available (from Discord webhook)
    // Otherwise fall back to generated ID
    const csvEventId = row["Event ID"]?.trim() || "";
    const generatedEventId = generateEventId(eventName, eventDate, venue);
    const eventId = csvEventId || generatedEventId;

    // Handle various status formats: SUCCESS, COMPLETED, completed, success, etc.
    const rawStatus = row["Status"]?.trim().toUpperCase() || "";
    const status = (rawStatus === "SUCCESS" || rawStatus === "COMPLETED") ? "SUCCESS" : "FAILED";
    const currency = row["Currency"]?.trim() || undefined;
    
    // Parse prices and convert to USD if needed
    const rawPriceEach = parseCurrency(row["Price Each"]);
    const rawTotalPrice = parseCurrency(row["Total Price"]);
    const priceEach = convertToUsd(rawPriceEach, currency);
    const totalPrice = convertToUsd(rawTotalPrice, currency);
    const quantity = parseInt(row["Quantity"]?.trim() || "1", 10) || 1;

    // Track stats
    if (status === "SUCCESS") {
      successCount++;
      totalRevenue += totalPrice;
    } else {
      failedCount++;
    }

    entries.push({
      jobId,
      status,
      profileId: row["Profile ID"]?.trim() || "",
      cardLast4: row["Card Last 4"]?.trim() || "",
      eventName,
      eventDate,
      venue,
      eventId,
      generatedEventId,
      quantity,
      priceEach,
      totalPrice,
      section: row["Section"]?.trim() || "",
      row: row["Row"]?.trim() || "",
      seats: row["Seats"]?.trim() || "",
      email,
      errorCode: row["Error Code"]?.trim() || "",
      errorMessage: row["Error Message"]?.trim() || "",
      targetUrl: row["Target URL"]?.trim() || "",
      finalUrl: row["Final URL"]?.trim() || "",
      createdAt: row["Created At"]?.trim() || "",
      startedAt: row["Started At"]?.trim() || "",
      completedAt: row["Completed At"]?.trim() || "",
      attemptCount: parseInt(row["Attempt Count"]?.trim() || "1", 10) || 1,
      // Card details (optional columns)
      cardNumber: row["Card Number"]?.trim() || undefined,
      cardType: row["Card Type"]?.trim() || undefined,
      expMonth: row["Exp Month"]?.trim() || undefined,
      expYear: row["Exp Year"]?.trim() || undefined,
      cvv: row["CVV"]?.trim() || undefined,
      // Billing details (optional columns)
      billingName: row["Billing Name"]?.trim() || undefined,
      billingPhone: row["Billing Phone"]?.trim() || undefined,
      billingAddress: row["Billing Address"]?.trim() || undefined,
      billingZip: row["Billing Zip"]?.trim() || undefined,
      billingCity: row["Billing City"]?.trim() || undefined,
      billingState: row["Billing State"]?.trim() || undefined,
      // Currency (optional)
      currency: row["Currency"]?.trim() || undefined,
    });
  }

  // Capture Papa parse errors
  if (result.errors && result.errors.length > 0) {
    for (const err of result.errors) {
      errors.push({
        row: err.row ?? -1,
        message: err.message,
      });
    }
  }

  return {
    data: entries,
    errors,
    stats: {
      total: result.data.length,
      parsed: entries.length,
      errored: errors.length,
      successCount,
      failedCount,
      totalRevenue,
    },
  };
}
