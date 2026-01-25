import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseCardProfilesFile } from "@/lib/importers";

/**
 * Import card profiles (unlinked cards without email)
 * These cards will have accountId = null
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const entries = parseCardProfilesFile(content);

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No valid entries found in file" },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { profileName: string; reason: string }[] = [];

    for (const entry of entries) {
      try {
        // Check if card already exists by profileName
        const existingByProfile = await prisma.card.findUnique({
          where: { profileName: entry.profileName },
        });

        // Check if card already exists by cardNumber
        const existingByCardNumber = await prisma.card.findUnique({
          where: { cardNumber: entry.cardNumber },
        });

        // If card exists by different profile name but same card number, skip
        if (existingByCardNumber && existingByCardNumber.profileName !== entry.profileName) {
          errors.push({ 
            profileName: entry.profileName, 
            reason: `Card number already used by profile "${existingByCardNumber.profileName}"` 
          });
          skipped++;
          continue;
        }

        if (existingByProfile) {
          // Update existing card (but don't overwrite accountId if it's linked)
          await prisma.card.update({
            where: { profileName: entry.profileName },
            data: {
              cardType: entry.cardType,
              cardNumber: entry.cardNumber,
              expMonth: entry.expMonth,
              expYear: entry.expYear,
              cvv: entry.cvv,
              billingName: entry.billingName,
              billingPhone: entry.billingPhone,
              billingAddress: entry.billingAddress,
              billingZip: entry.billingZip,
              billingCity: entry.billingCity,
              billingState: entry.billingState,
            },
          });
          updated++;
        } else {
          // Create new unlinked card (accountId = null)
          await prisma.card.create({
            data: {
              accountId: null, // Unlinked
              profileName: entry.profileName,
              cardType: entry.cardType,
              cardNumber: entry.cardNumber,
              expMonth: entry.expMonth,
              expYear: entry.expYear,
              cvv: entry.cvv,
              billingName: entry.billingName,
              billingPhone: entry.billingPhone,
              billingAddress: entry.billingAddress,
              billingZip: entry.billingZip,
              billingCity: entry.billingCity,
              billingState: entry.billingState,
            },
          });
          imported++;
        }
      } catch (error) {
        console.error(`Error importing card profile ${entry.profileName}:`, error);
        errors.push({ profileName: entry.profileName, reason: String(error) });
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: entries.length,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import file", details: String(error) },
      { status: 500 }
    );
  }
}
