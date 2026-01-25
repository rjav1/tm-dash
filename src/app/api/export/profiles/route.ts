import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    // Get all accounts with cards (now one-to-many)
    const accounts = await prisma.account.findMany({
      where: {
        cards: { some: { deletedAt: null } },
      },
      include: {
        cards: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: {
        email: "asc",
      },
    });

    // Build CSV content
    const headers = [
      "Email Address",
      "Profile Name",
      "Card Type",
      "Card Number",
      "Expiration Month",
      "Expiration Year",
      "CVV",
      "Billing Name",
      "Billing Phone",
      "Billing Address",
      "Billing Post Code",
      "Billing City",
      "Billing State",
    ];

    // Flatten: each card gets its own row with the account email
    const rows: string[][] = [];
    for (const account of accounts) {
      for (const card of account.cards) {
        rows.push([
          account.email,
          card.profileName || "",
          card.cardType,
          card.cardNumber,
          card.expMonth,
          card.expYear,
          card.cvv,
          card.billingName,
          card.billingPhone || "",
          card.billingAddress,
          card.billingZip,
          card.billingCity,
          card.billingState,
        ]);
      }
    }

    // Escape CSV values
    const escapeCSV = (value: string): string => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Return as downloadable CSV
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="profiles_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export profiles" },
      { status: 500 }
    );
  }
}
