/**
 * POS Auth API Routes
 *
 * POST /api/pos/auth - Test POS credentials and connection
 * GET /api/pos/auth - Check current auth status
 */

import { NextResponse } from "next/server";
import { TicketVaultApi } from "@/lib/services/ticketvault-api";

/**
 * GET /api/pos/auth
 * Check if POS credentials are configured and test connection
 */
export async function GET() {
  try {
    const result = await TicketVaultApi.testConnection();

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POS Auth API] Error testing connection:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/auth
 * Force refresh of POS authentication token
 */
export async function POST() {
  try {
    await TicketVaultApi.ensureAuthenticated();

    return NextResponse.json({
      success: true,
      message: "Authentication successful",
    });
  } catch (error) {
    console.error("[POS Auth API] Error authenticating:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Authentication failed",
      },
      { status: 500 }
    );
  }
}
