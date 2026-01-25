/**
 * Ticket Service
 * 
 * Handles creation and management of individual ticket records.
 * Provides utilities for:
 * - Parsing seat ranges (e.g., "1-4" -> [1, 2, 3, 4])
 * - Creating individual Ticket records from purchases
 * - Linking tickets to listings and sales
 */

import prisma from "@/lib/db";
import { TicketStatus } from "@prisma/client";

// =============================================================================
// Types
// =============================================================================

export interface ParsedSeatRange {
  seats: number[];
  isRange: boolean;
  original: string;
}

export interface CreateTicketsInput {
  purchaseId: string;
  eventId: string;
  section: string;
  row: string;
  seats: string; // e.g., "1-4" or "5,6,7" or "12"
  costPerTicket: number;
}

export interface TicketCreationResult {
  success: boolean;
  created: number;
  skipped: number;
  error?: string;
  tickets?: { id: string; seatNumber: number }[];
}

// =============================================================================
// Seat Parsing Utilities
// =============================================================================

/**
 * Parse a seat range string into individual seat numbers
 * Supports:
 * - Range: "1-4" -> [1, 2, 3, 4]
 * - List: "5,6,7" -> [5, 6, 7]
 * - Single: "12" -> [12]
 * - Mixed: "1-3,5,7-9" -> [1, 2, 3, 5, 7, 8, 9]
 */
export function parseSeatRange(seatString: string): ParsedSeatRange {
  const seats: number[] = [];
  const original = seatString.trim();
  
  if (!original) {
    return { seats: [], isRange: false, original };
  }
  
  // Check if it's a simple range like "1-4"
  const simpleRangeMatch = original.match(/^(\d+)\s*-\s*(\d+)$/);
  if (simpleRangeMatch) {
    const start = parseInt(simpleRangeMatch[1], 10);
    const end = parseInt(simpleRangeMatch[2], 10);
    for (let i = start; i <= end; i++) {
      seats.push(i);
    }
    return { seats, isRange: true, original };
  }
  
  // Check if it's a single number
  const singleMatch = original.match(/^(\d+)$/);
  if (singleMatch) {
    seats.push(parseInt(singleMatch[1], 10));
    return { seats, isRange: false, original };
  }
  
  // Handle comma-separated list (may contain ranges)
  const parts = original.split(',').map(p => p.trim());
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        seats.push(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) {
        seats.push(num);
      }
    }
  }
  
  // Sort and deduplicate
  const uniqueSeats = [...new Set(seats)].sort((a, b) => a - b);
  
  return {
    seats: uniqueSeats,
    isRange: uniqueSeats.length > 1,
    original,
  };
}

/**
 * Generate seat numbers from start and end seat
 * Useful when seats are given as startSeat/endSeat instead of a range string
 */
export function generateSeatNumbers(startSeat: number, endSeat: number): number[] {
  const seats: number[] = [];
  for (let i = startSeat; i <= endSeat; i++) {
    seats.push(i);
  }
  return seats;
}

// =============================================================================
// Ticket Creation
// =============================================================================

/**
 * Create individual Ticket records from a purchase
 */
export async function createTicketsFromPurchase(
  input: CreateTicketsInput
): Promise<TicketCreationResult> {
  try {
    const { purchaseId, eventId, section, row, seats, costPerTicket } = input;
    
    // Parse the seat range
    const parsed = parseSeatRange(seats);
    
    if (parsed.seats.length === 0) {
      return {
        success: false,
        created: 0,
        skipped: 0,
        error: `Could not parse seats from: "${seats}"`,
      };
    }
    
    const createdTickets: { id: string; seatNumber: number }[] = [];
    let skipped = 0;
    
    for (const seatNumber of parsed.seats) {
      try {
        // Try to create the ticket (upsert to handle duplicates)
        const ticket = await prisma.ticket.upsert({
          where: {
            eventId_section_row_seatNumber: {
              eventId,
              section,
              row,
              seatNumber,
            },
          },
          update: {
            // Only update if it's the same purchase (don't overwrite another purchase's ticket)
            purchaseId,
            cost: costPerTicket,
          },
          create: {
            purchaseId,
            eventId,
            section,
            row,
            seatNumber,
            cost: costPerTicket,
            status: TicketStatus.PURCHASED,
          },
        });
        
        createdTickets.push({ id: ticket.id, seatNumber });
      } catch (error) {
        // Ticket might already exist from a different purchase - skip it
        console.warn(
          `[TicketService] Skipping seat ${seatNumber} in ${section}/${row} - may already exist`
        );
        skipped++;
      }
    }
    
    console.log(
      `[TicketService] Created ${createdTickets.length} tickets for purchase ${purchaseId}, skipped ${skipped}`
    );
    
    return {
      success: true,
      created: createdTickets.length,
      skipped,
      tickets: createdTickets,
    };
  } catch (error) {
    console.error("[TicketService] Error creating tickets:", error);
    return {
      success: false,
      created: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create tickets from listing data (startSeat/endSeat format)
 */
export async function createTicketsFromListing(input: {
  purchaseId: string;
  eventId: string;
  listingId: string;
  section: string;
  row: string;
  startSeat: number;
  endSeat: number;
  costPerTicket: number;
}): Promise<TicketCreationResult> {
  const { purchaseId, eventId, listingId, section, row, startSeat, endSeat, costPerTicket } = input;
  
  const seatNumbers = generateSeatNumbers(startSeat, endSeat);
  const createdTickets: { id: string; seatNumber: number }[] = [];
  let skipped = 0;
  
  for (const seatNumber of seatNumbers) {
    try {
      const ticket = await prisma.ticket.upsert({
        where: {
          eventId_section_row_seatNumber: {
            eventId,
            section,
            row,
            seatNumber,
          },
        },
        update: {
          listingId,
          status: TicketStatus.LISTED,
        },
        create: {
          purchaseId,
          eventId,
          section,
          row,
          seatNumber,
          cost: costPerTicket,
          listingId,
          status: TicketStatus.LISTED,
        },
      });
      
      createdTickets.push({ id: ticket.id, seatNumber });
    } catch (error) {
      console.warn(`[TicketService] Skipping seat ${seatNumber} - error:`, error);
      skipped++;
    }
  }
  
  return {
    success: true,
    created: createdTickets.length,
    skipped,
    tickets: createdTickets,
  };
}

// =============================================================================
// Ticket Linking
// =============================================================================

/**
 * Link tickets to a listing by matching event/section/row/seats
 */
export async function linkTicketsToListing(
  listingId: string,
  eventId: string,
  section: string,
  row: string,
  startSeat: number,
  endSeat: number
): Promise<{ linked: number; notFound: number }> {
  const seatNumbers = generateSeatNumbers(startSeat, endSeat);
  let linked = 0;
  let notFound = 0;
  
  for (const seatNumber of seatNumbers) {
    const result = await prisma.ticket.updateMany({
      where: {
        eventId,
        section,
        row,
        seatNumber,
        listingId: null, // Only link if not already linked
      },
      data: {
        listingId,
        status: TicketStatus.LISTED,
      },
    });
    
    if (result.count > 0) {
      linked++;
    } else {
      notFound++;
    }
  }
  
  return { linked, notFound };
}

/**
 * Link tickets to a sale
 */
export async function linkTicketsToSale(
  saleId: string,
  eventId: string,
  section: string,
  row: string,
  seats: string
): Promise<{ linked: number; notFound: number }> {
  const parsed = parseSeatRange(seats);
  let linked = 0;
  let notFound = 0;
  
  for (const seatNumber of parsed.seats) {
    const result = await prisma.ticket.updateMany({
      where: {
        eventId,
        section,
        row,
        seatNumber,
        saleId: null, // Only link if not already sold
      },
      data: {
        saleId,
        status: TicketStatus.SOLD,
      },
    });
    
    if (result.count > 0) {
      linked++;
    } else {
      notFound++;
    }
  }
  
  return { linked, notFound };
}

// =============================================================================
// Ticket Queries
// =============================================================================

/**
 * Find tickets by event and seat details
 */
export async function findTickets(
  eventId: string,
  section: string,
  row: string,
  seatNumbers: number[]
) {
  return prisma.ticket.findMany({
    where: {
      eventId,
      section,
      row,
      seatNumber: { in: seatNumbers },
    },
    include: {
      purchase: {
        select: {
          id: true,
          dashboardPoNumber: true,
          accountId: true,
          cardId: true,
        },
      },
      listing: {
        select: {
          id: true,
          extPONumber: true,
          ticketGroupId: true,
        },
      },
      sale: {
        select: {
          id: true,
          invoiceNumber: true,
          salePrice: true,
        },
      },
    },
  });
}

/**
 * Get tickets for a purchase
 */
export async function getTicketsForPurchase(purchaseId: string) {
  return prisma.ticket.findMany({
    where: { purchaseId },
    orderBy: { seatNumber: "asc" },
    include: {
      listing: true,
      sale: true,
    },
  });
}

/**
 * Get the purchase PO number by tracing from sale through tickets
 */
export async function getPurchaseFromSale(
  saleId: string
): Promise<{ purchaseId: string; poNumber: string } | null> {
  // Find any ticket linked to this sale
  const ticket = await prisma.ticket.findFirst({
    where: { saleId },
    include: {
      purchase: {
        select: {
          id: true,
          dashboardPoNumber: true,
        },
      },
    },
  });
  
  if (ticket?.purchase) {
    return {
      purchaseId: ticket.purchase.id,
      poNumber: ticket.purchase.dashboardPoNumber || "",
    };
  }
  
  return null;
}

// =============================================================================
// Export
// =============================================================================

export const TicketService = {
  parseSeatRange,
  generateSeatNumbers,
  createTicketsFromPurchase,
  createTicketsFromListing,
  linkTicketsToListing,
  linkTicketsToSale,
  findTickets,
  getTicketsForPurchase,
  getPurchaseFromSale,
};
