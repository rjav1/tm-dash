import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseProfilesFile } from "@/lib/importers";
import { AccountStatus } from "@prisma/client";
import { formatSSE, getStreamHeaders } from "@/lib/utils/streaming";

/**
 * Helper to get or create card tag for auto-tagging
 */
async function getOrCreateCardTag(name: string, color: string) {
  let tag = await prisma.cardTag.findUnique({ where: { name } });
  if (!tag) {
    tag = await prisma.cardTag.create({ data: { name, color } });
  }
  return tag;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const streaming = formData.get("streaming") === "true";

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

    // Pre-load amex tag for auto-tagging 15-digit cards
    const amexTag = await getOrCreateCardTag("amex", "#006fcf");

    // If streaming is requested, return SSE stream
    if (streaming) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let imported = 0;
          let updated = 0;
          let skipped = 0;

          // Send start event
          controller.enqueue(encoder.encode(formatSSE({
            type: "start",
            total: entries.length,
            label: `Importing ${entries.length} profiles...`,
          })));

          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            let success = true;

            try {
              if (!entry.profileName) {
                skipped++;
                success = false;
              } else {
                const account = await prisma.account.upsert({
                  where: { email: entry.email },
                  create: { email: entry.email, status: AccountStatus.ACTIVE },
                  update: {},
                });

                const existingByProfile = await prisma.card.findUnique({
                  where: { profileName: entry.profileName },
                });

                const existingByCardNumber = await prisma.card.findUnique({
                  where: { cardNumber: entry.cardNumber },
                });

                if (existingByCardNumber && existingByCardNumber.profileName !== entry.profileName) {
                  skipped++;
                  success = false;
                } else if (existingByProfile) {
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
                  // Check if 15-digit card (AMEX)
                  const cleanCardNumber = entry.cardNumber.replace(/\D/g, "");
                  const isAmex = cleanCardNumber.length === 15;
                  
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
                      // Auto-tag 15-digit cards as amex
                      ...(isAmex && { tags: { connect: { id: amexTag.id } } }),
                    },
                  });
                  imported++;
                }
              }
            } catch (error) {
              console.error(`Error importing profile ${entry.profileName}:`, error);
              skipped++;
              success = false;
            }

            // Send progress event
            controller.enqueue(encoder.encode(formatSSE({
              type: "progress",
              current: i + 1,
              total: entries.length,
              label: entry.profileName || entry.email,
              success: imported + updated,
              failed: skipped,
            })));
          }

          // Send complete event
          controller.enqueue(encoder.encode(formatSSE({
            type: "complete",
            current: entries.length,
            total: entries.length,
            success: imported + updated,
            failed: skipped,
            message: `Imported ${imported} new, updated ${updated}, skipped ${skipped}`,
          })));

          controller.close();
        },
      });

      return new Response(stream, { headers: getStreamHeaders() });
    }

    // Non-streaming fallback
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { profileName: string; reason: string }[] = [];

    for (const entry of entries) {
      try {
        if (!entry.profileName) {
          errors.push({ profileName: "(empty)", reason: "Missing profile name" });
          skipped++;
          continue;
        }

        const account = await prisma.account.upsert({
          where: { email: entry.email },
          create: { email: entry.email, status: AccountStatus.ACTIVE },
          update: {},
        });

        const existingByProfile = await prisma.card.findUnique({
          where: { profileName: entry.profileName },
        });

        const existingByCardNumber = await prisma.card.findUnique({
          where: { cardNumber: entry.cardNumber },
        });

        if (existingByCardNumber && existingByCardNumber.profileName !== entry.profileName) {
          errors.push({ 
            profileName: entry.profileName, 
            reason: `Card number already used by profile "${existingByCardNumber.profileName}"` 
          });
          skipped++;
          continue;
        }

        if (existingByProfile) {
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
          // Check if 15-digit card (AMEX)
          const cleanCardNumber = entry.cardNumber.replace(/\D/g, "");
          const isAmex = cleanCardNumber.length === 15;
          
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
              // Auto-tag 15-digit cards as amex
              ...(isAmex && { tags: { connect: { id: amexTag.id } } }),
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
