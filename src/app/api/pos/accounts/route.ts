import { NextResponse } from "next/server";
import { TicketVaultApi } from "@/lib/services/ticketvault-api";

/**
 * GET /api/pos/accounts
 * List all connected accounts (Season Sites) in TicketVault
 */
export async function GET() {
  try {
    const sites = await TicketVaultApi.getSeasonSitesList();

    // Return simplified list
    const accounts = sites.map((s) => ({
      id: s.CompanySeasonSiteID,
      email: s.UserName,
      site: s.Site,
      url: s.Url,
      invalidCredentials: s.InvalidCredentials,
      isDeleted: s.IsDeleted,
      lastChecked: s.LastCheckedDateTimeUTC,
      processingStatus: s.ProcessingStatus,
      lastError: s.LastError,
      addedAfterLastSync: s.TotalAddedAfterLastSync,
      updatedAfterLastSync: s.TotalUpdatedAfterLastSync,
    }));

    return NextResponse.json({
      success: true,
      count: accounts.length,
      accounts,
    });
  } catch (error) {
    console.error("Get POS accounts error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
