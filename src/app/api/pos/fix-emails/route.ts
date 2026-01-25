import { NextResponse } from "next/server";
import { TicketVaultApi } from "@/lib/services/ticketvault-api";

/**
 * GET /api/pos/fix-emails
 * Check for tickets in POS that have email in InternalNote but not in AccountEmail
 */
export async function GET() {
  try {
    const { listings } = await TicketVaultApi.getAllOperationsInfo({ take: 500 });

    const needsFix: Array<{
      ticketGroupId: number;
      section: string;
      row: string;
      currentAccountEmail: string | null;
      internalNote: string | null;
      extractedEmail: string | null;
    }> = [];

    for (const listing of listings) {
      // Check if AccountEmail is empty but InternalNote has an email
      if (!listing.AccountEmail && listing.InternalNote) {
        const emailMatch = listing.InternalNote.trim().match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          needsFix.push({
            ticketGroupId: listing.TicketGroupID,
            section: listing.Section,
            row: listing.Row,
            currentAccountEmail: listing.AccountEmail || null,
            internalNote: listing.InternalNote,
            extractedEmail: emailMatch[0],
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalListings: listings.length,
      needsFixCount: needsFix.length,
      needsFix,
    });
  } catch (error) {
    console.error("Check emails error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pos/fix-emails
 * Fix tickets in POS by setting AccountEmail from InternalNote
 */
export async function POST() {
  try {
    const { listings } = await TicketVaultApi.getAllOperationsInfo({ take: 500 });

    let fixed = 0;
    const fixedTickets: Array<{
      ticketGroupId: number;
      section: string;
      row: string;
      email: string;
    }> = [];
    const errors: Array<{
      ticketGroupId: number;
      error: string;
    }> = [];

    for (const listing of listings) {
      // Check if AccountEmail is empty but InternalNote has an email
      if (!listing.AccountEmail && listing.InternalNote) {
        const emailMatch = listing.InternalNote.trim().match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          const email = emailMatch[0];
          
          try {
            // Use UpdateTicketGroups to set the AccountEmail
            await TicketVaultApi.updateTicketGroups(
              [listing.TicketGroupID],
              {
                section: listing.Section,
                row: listing.Row,
                quantity: listing.Quantity,
                startSeat: listing.StartSeat,
                endSeat: listing.EndSeat,
                ticketCost: listing.Cost,
                ticketCostTotal: listing.Cost * listing.Quantity,
                extPONumber: listing.HtmlExtPOIDMultiLineTooltip || listing.HtmlExtPOIDEllipsis || "",
                accountEmail: email, // Set the AccountEmail
              }
            );

            fixedTickets.push({
              ticketGroupId: listing.TicketGroupID,
              section: listing.Section,
              row: listing.Row,
              email,
            });
            fixed++;
          } catch (updateError) {
            errors.push({
              ticketGroupId: listing.TicketGroupID,
              error: String(updateError),
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      fixed,
      fixedTickets,
      errors,
    });
  } catch (error) {
    console.error("Fix emails error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
