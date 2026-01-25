import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseImapConfig } from "@/lib/importers";

interface ImportError {
  email?: string;
  reason: string;
  details?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.text();
    const parseResult = parseImapConfig(content);

    if (parseResult.imapCredentials.length === 0) {
      return NextResponse.json(
        { 
          error: "No valid IMAP credentials found in config",
          parseErrors: parseResult.errors,
        },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const importErrors: ImportError[] = [];

    for (const cred of parseResult.imapCredentials) {
      try {
        // Check if credential exists
        const existing = await prisma.imapCredential.findUnique({
          where: { email: cred.email },
        });

        if (existing) {
          // Update existing credential
          await prisma.imapCredential.update({
            where: { email: cred.email },
            data: {
              password: cred.password,
              provider: cred.provider,
              isEnabled: cred.isEnabled,
            },
          });
          updated++;
        } else {
          // Create new credential
          await prisma.imapCredential.create({
            data: {
              email: cred.email,
              password: cred.password,
              provider: cred.provider,
              isEnabled: cred.isEnabled,
            },
          });
          imported++;
        }
      } catch (error) {
        importErrors.push({
          email: cred.email,
          reason: "Database error",
          details: error instanceof Error ? error.message : String(error),
        });
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: parseResult.imapCredentials.length,
      parseErrors: parseResult.errors.length,
      importErrors: importErrors.slice(0, 50),
      hasAycdInbox: !!parseResult.aycdInbox,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import config", details: String(error) },
      { status: 500 }
    );
  }
}
