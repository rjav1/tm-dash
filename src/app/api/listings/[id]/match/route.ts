import { NextRequest, NextResponse } from "next/server";
import { ListingService } from "@/lib/services/listing-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/listings/[id]/match
 * Trigger match/sync for a listing
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await ListingService.triggerMatch(id);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          accountEmail: result.accountEmail,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Sync triggered for account: ${result.accountEmail}`,
      accountEmail: result.accountEmail,
      seasonSiteId: result.seasonSiteId,
      processingStatus: result.processingStatus,
    });
  } catch (error) {
    console.error("Trigger match error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/listings/[id]/match
 * Get account sync status for a listing
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const status = await ListingService.getAccountSyncStatus(id);

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error("Get match status error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
