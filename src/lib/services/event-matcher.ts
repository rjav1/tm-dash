/**
 * Event Matcher Service
 * 
 * Provides fuzzy matching for events from different sources:
 * - TicketVault POS (listings, sales)
 * - Ticketmaster (purchases)
 * - Dashboard (manual entry)
 * 
 * Uses multiple matching strategies:
 * 1. Exact ID match (posProductionId, tmEventId)
 * 2. Name + Date match
 * 3. Fuzzy name match
 */

import prisma from "@/lib/db";
import { Event } from "@prisma/client";

// =============================================================================
// Types
// =============================================================================

export interface EventMatchInput {
  // TicketVault fields
  posProductionId?: number;
  posVenueId?: number;
  
  // Ticketmaster fields
  tmEventId?: string;
  
  // Common fields
  eventName: string;
  venue?: string;
  eventDate?: Date;
  artistName?: string;
}

export interface EventMatchResult {
  found: boolean;
  event: Event | null;
  matchType: "pos_production_id" | "tm_event_id" | "name_date" | "fuzzy_name" | "created" | "none";
  confidence: number; // 0-1
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalize a string for comparison
 * - Lowercase
 * - Remove special characters
 * - Trim whitespace
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract core name from event name
 * e.g., "Bruno Mars - The Romantic Tour" -> "bruno mars"
 * e.g., "BTS World Tour 2026" -> "bts"
 */
function extractCoreName(eventName: string): string {
  const normalized = normalize(eventName);
  
  // Remove common suffixes
  const suffixes = [
    "tour",
    "world tour",
    "concert",
    "live",
    "in concert",
    "presents",
    "the",
    "2024",
    "2025",
    "2026",
    "2027",
  ];
  
  let result = normalized;
  for (const suffix of suffixes) {
    result = result.replace(new RegExp(`\\s*${suffix}\\s*$`, "i"), "");
    result = result.replace(new RegExp(`^\\s*${suffix}\\s*`, "i"), "");
  }
  
  // Take only the first part if there's a dash
  const dashIndex = result.indexOf(" - ");
  if (dashIndex > 0) {
    result = result.substring(0, dashIndex);
  }
  
  return result.trim();
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = Math.min(s1.length, s2.length);
    const longer = Math.max(s1.length, s2.length);
    return shorter / longer;
  }
  
  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);
  
  return 1 - distance / maxLength;
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// =============================================================================
// Matching Functions
// =============================================================================

/**
 * Find an existing event by POS production ID
 */
async function findByPosProductionId(
  posProductionId: number
): Promise<Event | null> {
  return prisma.event.findUnique({
    where: { posProductionId },
  });
}

/**
 * Find an existing event by Ticketmaster event ID
 */
async function findByTmEventId(tmEventId: string): Promise<Event | null> {
  return prisma.event.findUnique({
    where: { tmEventId },
  });
}

/**
 * Find event by name and date (exact match on date, fuzzy on name)
 */
async function findByNameAndDate(
  eventName: string,
  eventDate: Date,
  venue?: string
): Promise<{ event: Event; confidence: number } | null> {
  // Get events on the same day
  const startOfDay = new Date(eventDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(eventDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  const events = await prisma.event.findMany({
    where: {
      eventDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });
  
  if (events.length === 0) return null;
  
  // Score each event
  let bestMatch: { event: Event; confidence: number } | null = null;
  
  for (const event of events) {
    // Calculate name similarity
    const nameSimilarity = stringSimilarity(eventName, event.eventName);
    const coreNameSimilarity = stringSimilarity(
      extractCoreName(eventName),
      extractCoreName(event.eventName)
    );
    
    // Calculate venue similarity if provided
    let venueSimilarity = 1; // Default to 1 if no venue to compare
    if (venue && event.venue) {
      venueSimilarity = stringSimilarity(venue, event.venue);
    }
    
    // Combined confidence score
    const confidence =
      Math.max(nameSimilarity, coreNameSimilarity) * 0.6 + venueSimilarity * 0.4;
    
    if (confidence > 0.7 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { event, confidence };
    }
  }
  
  return bestMatch;
}

/**
 * Find event by fuzzy name match (no date constraint)
 */
async function findByFuzzyName(
  eventName: string,
  artistName?: string
): Promise<{ event: Event; confidence: number } | null> {
  const searchName = artistName || extractCoreName(eventName);
  
  // Get candidate events
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { eventName: { contains: searchName, mode: "insensitive" } },
        { artistName: { contains: searchName, mode: "insensitive" } },
      ],
    },
    take: 20,
  });
  
  if (events.length === 0) return null;
  
  // Score each event
  let bestMatch: { event: Event; confidence: number } | null = null;
  
  for (const event of events) {
    const nameSimilarity = stringSimilarity(eventName, event.eventName);
    const artistSimilarity = artistName && event.artistName
      ? stringSimilarity(artistName, event.artistName)
      : 0;
    
    const confidence = Math.max(nameSimilarity, artistSimilarity);
    
    if (confidence > 0.6 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { event, confidence };
    }
  }
  
  return bestMatch;
}

// =============================================================================
// Main Matching Function
// =============================================================================

/**
 * Find or create an event based on input data
 */
export async function findOrCreateEvent(
  input: EventMatchInput,
  createIfNotFound: boolean = true
): Promise<EventMatchResult> {
  const { posProductionId, tmEventId, eventName, venue, eventDate, artistName } =
    input;
  
  // Strategy 1: Match by POS Production ID
  if (posProductionId) {
    const event = await findByPosProductionId(posProductionId);
    if (event) {
      return {
        found: true,
        event,
        matchType: "pos_production_id",
        confidence: 1,
      };
    }
  }
  
  // Strategy 2: Match by Ticketmaster Event ID
  if (tmEventId) {
    const event = await findByTmEventId(tmEventId);
    if (event) {
      return {
        found: true,
        event,
        matchType: "tm_event_id",
        confidence: 1,
      };
    }
  }
  
  // Strategy 3: Match by Name + Date
  if (eventDate) {
    const match = await findByNameAndDate(eventName, eventDate, venue);
    if (match) {
      // Update the event with POS fields if we have them
      if (posProductionId && !match.event.posProductionId) {
        await prisma.event.update({
          where: { id: match.event.id },
          data: {
            posProductionId,
            posVenueId: input.posVenueId,
          },
        });
      }
      
      return {
        found: true,
        event: match.event,
        matchType: "name_date",
        confidence: match.confidence,
      };
    }
  }
  
  // Strategy 4: Fuzzy name match
  const fuzzyMatch = await findByFuzzyName(eventName, artistName);
  if (fuzzyMatch && fuzzyMatch.confidence > 0.8) {
    return {
      found: true,
      event: fuzzyMatch.event,
      matchType: "fuzzy_name",
      confidence: fuzzyMatch.confidence,
    };
  }
  
  // Not found - create if requested, but ONLY if we have a real tmEventId
  // Never create events with generated IDs - this creates orphaned/duplicate data
  if (createIfNotFound && tmEventId) {
    const newEvent = await prisma.event.create({
      data: {
        tmEventId,
        eventName,
        venue: venue || null,
        eventDate: eventDate || null,
        artistName: artistName || extractCoreName(eventName),
        posProductionId: posProductionId || null,
        posVenueId: input.posVenueId || null,
      },
    });
    
    console.log(`[EventMatcher] Created new event: ${newEvent.eventName} (${newEvent.id})`);
    
    return {
      found: false,
      event: newEvent,
      matchType: "created",
      confidence: 1,
    };
  }
  
  // If createIfNotFound but no tmEventId, log a warning and don't create
  if (createIfNotFound && !tmEventId) {
    console.warn(`[EventMatcher] Skipping event creation for "${eventName}" - no tmEventId provided`);
  }
  
  return {
    found: false,
    event: null,
    matchType: "none",
    confidence: 0,
  };
}

/**
 * Update event with POS data
 */
export async function updateEventWithPosData(
  eventId: string,
  posData: {
    posProductionId?: number;
    posVenueId?: number;
  }
): Promise<Event> {
  return prisma.event.update({
    where: { id: eventId },
    data: {
      posProductionId: posData.posProductionId,
      posVenueId: posData.posVenueId,
    },
  });
}

// =============================================================================
// Export
// =============================================================================

export const EventMatcher = {
  findOrCreateEvent,
  updateEventWithPosData,
  normalize,
  extractCoreName,
  stringSimilarity,
};
