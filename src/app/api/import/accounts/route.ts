import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseAccountsFile } from "@/lib/importers";
import { AccountStatus } from "@prisma/client";

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
    const parseResult = parseAccountsFile(content);

    if (parseResult.data.length === 0) {
      return NextResponse.json(
        { 
          error: "No valid entries found in file",
          parseErrors: parseResult.errors.slice(0, 20), // Return first 20 parse errors
        },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const importErrors: ImportError[] = [];

    for (const entry of parseResult.data) {
      try {
        // Create or get proxy if provided
        let creationProxyId: string | undefined;
        if (entry.creationProxy) {
          const proxy = await prisma.proxy.upsert({
            where: { proxyString: entry.creationProxy },
            create: {
              proxyString: entry.creationProxy,
              provider: extractProxyProvider(entry.creationProxy),
            },
            update: {},
          });
          creationProxyId = proxy.id;
        }

        // Check if account exists
        const existing = await prisma.account.findUnique({
          where: { email: entry.email },
        });

        if (existing) {
          // Update existing account with new data
          await prisma.account.update({
            where: { email: entry.email },
            data: {
              password: entry.password || existing.password,
              imapProvider: entry.imapProvider || existing.imapProvider,
              phoneNumber: entry.phoneNumber || existing.phoneNumber,
              creationProxyId: creationProxyId || existing.creationProxyId,
            },
          });
          updated++;
        } else {
          // Create new account
          await prisma.account.create({
            data: {
              email: entry.email,
              password: entry.password,
              imapProvider: entry.imapProvider,
              phoneNumber: entry.phoneNumber,
              creationProxyId,
              status: AccountStatus.ACTIVE,
            },
          });
          imported++;
        }
      } catch (error) {
        importErrors.push({
          email: entry.email,
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
      total: parseResult.data.length,
      parseErrors: parseResult.errors.length,
      importErrors: importErrors.slice(0, 50), // Return first 50 import errors
      stats: parseResult.stats,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import file", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Extract provider from proxy string
 * Format: ip:port:user:provider
 */
function extractProxyProvider(proxyString: string): string | undefined {
  const parts = proxyString.split(":");
  if (parts.length >= 4) {
    return parts[3];
  }
  return undefined;
}
