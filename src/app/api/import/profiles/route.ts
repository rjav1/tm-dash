import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseProfilesFile } from "@/lib/importers";
import { AccountStatus } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const entries = parseProfilesFile(content);

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
        // Skip entries without profile name
        if (!entry.profileName) {
          errors.push({ profileName: "(empty)", reason: "Missing profile name" });
          skipped++;
          continue;
        }

        // Upsert account by email
        const account = await prisma.account.upsert({
          where: { email: entry.email },
          create: {
            email: entry.email,
            status: AccountStatus.ACTIVE,
          },
          update: {},
        });

        // Check if card already exists by profileName or cardNumber
        const existingByProfile = await prisma.card.findUnique({
          where: { profileName: entry.profileName },
        });

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
          // Update existing card and link to account
          await prisma.card.update({
            where: { profileName: entry.profileName },
            data: {
              accountId: account.id,
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
          // Create new card linked to account
          await prisma.card.create({
            data: {
              accountId: account.id,
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
        console.error(`Error importing profile ${entry.profileName}:`, error);
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
