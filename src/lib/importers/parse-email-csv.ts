/**
 * Parser for AYCD scraped email CSV files
 * Format: Template ID,Template Name,Mail Credentials,ticketmaster order number,event name,event date,event venue and location,seat information,card used,total price
 */

import Papa from "papaparse";
import crypto from "crypto";

export interface EmailCsvEntry {
  // Parsed fields
  email: string;
  tmOrderNumber: string; // e.g., "58-53758/NY1"
  eventName: string;
  eventDate: string;
  eventDateParsed: Date | null;
  dayOfWeek: string | null;
  venue: string;
  section: string;
  row: string;
  seats: string;
  quantity: number;
  cardType: string; // VISA, MASTERCARD, etc.
  cardLast4: string;
  totalPrice: number; // Always stored in USD
  originalCurrency: "USD" | "CAD"; // Currency detected from venue location
  // Generated event ID for matching
  generatedEventId: string;
  // Original row number for error reporting
  rowNumber: number;
}

// CAD to USD conversion rate (approximate)
const CAD_TO_USD_RATE = 0.72;

// Canadian provinces for detecting CAD prices
const CANADIAN_PROVINCES = [
  "Ontario",
  "Quebec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland",
  "Prince Edward Island",
  "Northwest Territories",
  "Yukon",
  "Nunavut",
  // Abbreviations
  "ON",
  "QC",
  "BC",
  "AB",
  "MB",
  "SK",
  "NS",
  "NB",
  "NL",
  "PE",
  "NT",
  "YT",
  "NU",
];

/**
 * Check if a venue location is in Canada
 */
function isCanadianVenue(venueAndLocation: string): boolean {
  if (!venueAndLocation) return false;
  const upperLocation = venueAndLocation.toUpperCase();
  return CANADIAN_PROVINCES.some(
    (province) =>
      upperLocation.includes(province.toUpperCase()) ||
      upperLocation.includes(`, ${province.toUpperCase()}`) ||
      upperLocation.endsWith(` ${province.toUpperCase()}`)
  );
}

/**
 * Convert CAD to USD
 */
function convertCadToUsd(cadAmount: number): number {
  return Math.round(cadAmount * CAD_TO_USD_RATE * 100) / 100;
}

export interface ParseError {
  row: number;
  field?: string;
  message: string;
  rawData?: string;
}

export interface ParseWarning {
  row: number;
  message: string;
}

export interface EmailCsvParseResult {
  data: EmailCsvEntry[];
  errors: ParseError[];
  warnings: ParseWarning[];
  stats: {
    total: number;
    parsed: number;
    errored: number;
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
  const datePart = eventDate.split(" · ").slice(0, 2).join(" · ")?.trim() || eventDate;
  
  const input = `${normalizedName}|${datePart}|${normalizedVenue}`;
  const hash = crypto.createHash("md5").update(input).digest("hex");
  
  // Return first 16 chars of hash (same length as TM event IDs)
  return hash.substring(0, 16).toUpperCase();
}

/**
 * Parse TM order number from string like "Order # 58-53758/NY1"
 */
function parseOrderNumber(raw: string): string {
  if (!raw) return "";
  // Extract the order number after "Order #" or "Order#"
  const match = raw.match(/Order\s*#?\s*(.+)/i);
  if (match) {
    return match[1].trim();
  }
  return raw.trim();
}

/**
 * Parse currency string to number
 * Handles formats like "Total:  $264.00", "$1,234.56"
 */
function parseCurrency(val: string): number {
  if (!val || val.trim() === "") return 0;
  // Remove "Total:", "$", commas, and extra spaces
  const cleaned = val
    .replace(/Total:\s*/i, "")
    .replace(/[$,]/g, "")
    .trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse seat information to extract section, row, seats, and calculate quantity
 * Examples:
 * - "Sec 321, Row 12, Seat 25 - 26" → section: "321", row: "12", seats: "25-26", quantity: 2
 * - "Sec SEC1, Row 18, Seat 13 - 14" → section: "SEC1", row: "18", seats: "13-14", quantity: 2
 * - "Sec POOL B, Row 8, Seat 3 - 4" → section: "POOL B", row: "8", seats: "3-4", quantity: 2
 * - "Sec 444, Row 2, Seat 11 - 14" → section: "444", row: "2", seats: "11-14", quantity: 4
 */
interface SeatInfo {
  section: string;
  row: string;
  seats: string;
  quantity: number;
}

function parseSeatInfo(raw: string): SeatInfo {
  const result: SeatInfo = {
    section: "",
    row: "",
    seats: "",
    quantity: 1,
  };

  if (!raw) return result;

  // Parse section: "Sec 321" or "Sec SEC1" or "Sec POOL B"
  const sectionMatch = raw.match(/Sec\s+([^,]+)/i);
  if (sectionMatch) {
    result.section = sectionMatch[1].trim();
  }

  // Parse row: "Row 12" or "Row A"
  const rowMatch = raw.match(/Row\s+([^,]+)/i);
  if (rowMatch) {
    result.row = rowMatch[1].trim();
  }

  // Parse seats: "Seat 25 - 26" or "Seat 5" or "Seat 11 - 14"
  const seatMatch = raw.match(/Seat\s+([\d]+)\s*-?\s*([\d]*)/i);
  if (seatMatch) {
    const startSeat = parseInt(seatMatch[1], 10);
    const endSeat = seatMatch[2] ? parseInt(seatMatch[2], 10) : startSeat;
    
    if (endSeat > startSeat) {
      result.seats = `${startSeat}-${endSeat}`;
      result.quantity = endSeat - startSeat + 1;
    } else {
      result.seats = String(startSeat);
      result.quantity = 1;
    }
  }

  return result;
}

/**
 * Parse card used field to extract card type and last 4 digits
 * Examples:
 * - "VISA — 7119" → { cardType: "VISA", cardLast4: "7119" }
 * - "MASTERCARD — 1234" → { cardType: "MASTERCARD", cardLast4: "1234" }
 */
interface CardInfo {
  cardType: string;
  cardLast4: string;
}

function parseCardUsed(raw: string): CardInfo {
  const result: CardInfo = {
    cardType: "",
    cardLast4: "",
  };

  if (!raw) return result;

  // Split by em-dash or regular dash
  const parts = raw.split(/\s*[—-]\s*/);
  if (parts.length >= 2) {
    result.cardType = parts[0].trim().toUpperCase();
    result.cardLast4 = parts[1].trim();
  } else {
    // Try to extract just the last 4 digits
    const lastFourMatch = raw.match(/(\d{4})\s*$/);
    if (lastFourMatch) {
      result.cardLast4 = lastFourMatch[1];
    }
  }

  return result;
}

/**
 * Parse venue and location
 * Example: "MetLife Stadium — East Rutherford, New Jersey"
 * Returns: "MetLife Stadium"
 */
function parseVenue(raw: string): string {
  if (!raw) return "";
  // Split by em-dash and take the first part (venue name)
  const parts = raw.split(/\s*—\s*/);
  return parts[0]?.trim() || raw.trim();
}

/**
 * Parse event date to extract day of week and Date object
 * Example: "Sun · Aug 02, 2026 · 8:00 PM"
 */
function parseEventDate(raw: string): { parsed: Date | null; dayOfWeek: string | null } {
  if (!raw) return { parsed: null, dayOfWeek: null };

  // Extract day of week (first part before ·)
  const parts = raw.split(" · ");
  const dayOfWeek = parts[0]?.trim() || null;

  // Try to parse the date
  try {
    // Remove day of week and join remaining parts
    const dateStr = parts.slice(1).join(" ").trim();
    // Parse date like "Aug 02, 2026 · 8:00 PM"
    const cleanedDate = dateStr.replace(" · ", " ");
    const parsed = new Date(cleanedDate);
    if (!isNaN(parsed.getTime())) {
      return { parsed, dayOfWeek };
    }
  } catch {
    // Fall through to return null
  }

  return { parsed: null, dayOfWeek };
}

/**
 * Handle multi-line CSV entries
 * Some entries span multiple lines (like Shane Gillis Live with pre-show party)
 * This pre-processes the raw CSV content to merge multi-line entries
 */
function preprocessMultilineEntries(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let currentLine = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Count quotes - if odd number, this line continues to the next
    const quoteCount = (line.match(/"/g) || []).length;
    
    if (currentLine === "") {
      // Starting a new row
      if (quoteCount % 2 === 0) {
        // Complete line
        result.push(line);
      } else {
        // Incomplete line, start accumulating
        currentLine = line;
      }
    } else {
      // Continuing a multi-line entry
      currentLine += "\n" + line;
      
      // Count total quotes in accumulated line
      const totalQuotes = (currentLine.match(/"/g) || []).length;
      if (totalQuotes % 2 === 0) {
        // Now complete
        result.push(currentLine);
        currentLine = "";
      }
    }
  }

  // Don't forget any remaining content
  if (currentLine) {
    result.push(currentLine);
  }

  return result.join("\n");
}

/**
 * Parse AYCD email CSV file
 */
export function parseEmailCsvFile(content: string): EmailCsvParseResult {
  // Pre-process to handle multi-line entries
  const preprocessed = preprocessMultilineEntries(content);

  const result = Papa.parse<Record<string, string>>(preprocessed, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const entries: EmailCsvEntry[] = [];
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];
  let rowIndex = 1;

  // Track seen order numbers to detect duplicates within the same CSV
  const seenOrderNumbers = new Set<string>();

  for (const row of result.data) {
    rowIndex++;

    // Get email from "Mail Credentials" column
    const email = row["Mail Credentials"]?.trim().toLowerCase();
    if (!email) {
      errors.push({
        row: rowIndex,
        field: "Mail Credentials",
        message: "Missing email address",
        rawData: JSON.stringify(row),
      });
      continue;
    }

    // Parse order number
    const tmOrderNumber = parseOrderNumber(row["ticketmaster order number"]);
    if (!tmOrderNumber) {
      errors.push({
        row: rowIndex,
        field: "ticketmaster order number",
        message: "Missing order number",
        rawData: JSON.stringify(row),
      });
      continue;
    }

    // Check for duplicate order numbers within this CSV
    if (seenOrderNumbers.has(tmOrderNumber)) {
      warnings.push({
        row: rowIndex,
        message: `Duplicate order number ${tmOrderNumber} in CSV - skipping`,
      });
      continue;
    }
    seenOrderNumbers.add(tmOrderNumber);

    // Parse event info
    const eventName = row["event name"]?.trim() || "";
    const eventDateRaw = row["event date"]?.trim() || "";
    const venueRaw = row["event venue and location"]?.trim() || "";
    const venue = parseVenue(venueRaw);

    if (!eventName) {
      errors.push({
        row: rowIndex,
        field: "event name",
        message: "Missing event name",
        rawData: JSON.stringify(row),
      });
      continue;
    }

    // Parse seat information
    const seatRaw = row["seat information"]?.trim() || "";
    const seatInfo = parseSeatInfo(seatRaw);

    if (!seatInfo.section && seatRaw) {
      warnings.push({
        row: rowIndex,
        message: `Could not parse seat info: "${seatRaw}"`,
      });
    }

    // Parse card info
    const cardRaw = row["card used"]?.trim() || "";
    const cardInfo = parseCardUsed(cardRaw);

    if (!cardInfo.cardLast4) {
      warnings.push({
        row: rowIndex,
        message: `Could not extract card last 4 from: "${cardRaw}"`,
      });
    }

    // Parse total price
    const priceRaw = row["total price"]?.trim() || "";
    const rawPrice = parseCurrency(priceRaw);

    // Detect if this is a Canadian venue and convert CAD to USD
    const isCanadian = isCanadianVenue(venueRaw);
    const originalCurrency: "USD" | "CAD" = isCanadian ? "CAD" : "USD";
    const totalPrice = isCanadian ? convertCadToUsd(rawPrice) : rawPrice;

    // Parse event date
    const { parsed: eventDateParsed, dayOfWeek } = parseEventDate(eventDateRaw);

    // Generate event ID
    const generatedEventId = generateEventId(eventName, eventDateRaw, venue);

    entries.push({
      email,
      tmOrderNumber,
      eventName,
      eventDate: eventDateRaw,
      eventDateParsed,
      dayOfWeek,
      venue,
      section: seatInfo.section,
      row: seatInfo.row,
      seats: seatInfo.seats,
      quantity: seatInfo.quantity,
      cardType: cardInfo.cardType,
      cardLast4: cardInfo.cardLast4,
      totalPrice,
      originalCurrency,
      generatedEventId,
      rowNumber: rowIndex,
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
    warnings,
    stats: {
      total: result.data.length,
      parsed: entries.length,
      errored: errors.length,
    },
  };
}
