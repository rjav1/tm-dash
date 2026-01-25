import { NextRequest, NextResponse } from "next/server";
import { 
  getEventsForSync, 
  createBatchSyncStream, 
  getStreamHeaders 
} from "@/lib/services/event-sync";

/**
 * POST /api/events/sync-all
 * Sync events' information from Ticketmaster AND prices from Vivid Seats
 * Uses streaming for real-time progress updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventIds } = body;

    // Get events to sync
    const events = await getEventsForSync(eventIds);

    // Create streaming response with both info and price sync
    const stream = createBatchSyncStream(events, {
      syncInfo: true,
      syncPrice: true,
    });

    return new Response(stream, {
      headers: getStreamHeaders(),
    });
  } catch (error) {
    console.error("Sync all events error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync events",
      },
      { status: 500 }
    );
  }
}
