import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseAccountsFile, parseImapConfig } from "@/lib/importers";
import { AccountStatus } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";

const TM_GENERATOR_PATH = process.env.TM_GENERATOR_PATH || "c:\\Users\\Rahil\\Downloads\\tm-generator";

/**
 * POST /api/sync/tm-generator
 * Sync accounts and IMAP config from tm-generator directory
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { syncAccounts = true, syncImap = true, accountsFile } = body;

    const results = {
      accounts: { imported: 0, updated: 0, skipped: 0, errors: [] as string[] },
      imap: { imported: 0, updated: 0, errors: [] as string[] },
      proxies: { created: 0 },
    };

    // Sync accounts from specified file or default locations
    if (syncAccounts) {
      const possiblePaths = accountsFile 
        ? [accountsFile]
        : [
            process.env.TM_ACCOUNTS_CSV_PATH,
            path.join(TM_GENERATOR_PATH, "output", "success.csv"),
            path.join(TM_GENERATOR_PATH, "data", "accounts.csv"),
          ].filter(Boolean) as string[];

      for (const filePath of possiblePaths) {
        try {
          const content = await fs.readFile(filePath, "utf-8");
          if (!content.trim()) continue;

          const parseResult = parseAccountsFile(content);
          
          for (const entry of parseResult.data) {
            try {
              // Create proxy if exists
              let creationProxyId: string | undefined;
              if (entry.creationProxy) {
                const proxy = await prisma.proxy.upsert({
                  where: { proxyString: entry.creationProxy },
                  create: {
                    proxyString: entry.creationProxy,
                    provider: entry.creationProxy.split(":")[3],
                  },
                  update: {},
                });
                creationProxyId = proxy.id;
                results.proxies.created++;
              }

              const existing = await prisma.account.findUnique({
                where: { email: entry.email },
              });

              if (existing) {
                await prisma.account.update({
                  where: { email: entry.email },
                  data: {
                    password: entry.password || existing.password,
                    imapProvider: entry.imapProvider || existing.imapProvider,
                    phoneNumber: entry.phoneNumber || existing.phoneNumber,
                    creationProxyId: creationProxyId || existing.creationProxyId,
                  },
                });
                results.accounts.updated++;
              } else {
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
                results.accounts.imported++;
              }
            } catch (error) {
              results.accounts.errors.push(`${entry.email}: ${error}`);
              results.accounts.skipped++;
            }
          }

          // Only process first file that has data
          if (parseResult.data.length > 0) break;
        } catch {
          // File doesn't exist, try next
          continue;
        }
      }
    }

    // Sync IMAP config
    if (syncImap) {
      const configPath = path.join(TM_GENERATOR_PATH, "config", "config.json");
      
      try {
        const configContent = await fs.readFile(configPath, "utf-8");
        const imapResult = parseImapConfig(configContent);
        
        for (const cred of imapResult.imapCredentials) {
          try {
            const existing = await prisma.imapCredential.findUnique({
              where: { email: cred.email },
            });

            if (existing) {
              await prisma.imapCredential.update({
                where: { email: cred.email },
                data: {
                  password: cred.password,
                  provider: cred.provider,
                  isEnabled: cred.isEnabled,
                },
              });
              results.imap.updated++;
            } else {
              await prisma.imapCredential.create({
                data: {
                  email: cred.email,
                  password: cred.password,
                  provider: cred.provider,
                  isEnabled: cred.isEnabled,
                },
              });
              results.imap.imported++;
            }
          } catch (error) {
            results.imap.errors.push(`${cred.email}: ${error}`);
          }
        }

        if (imapResult.errors.length > 0) {
          results.imap.errors.push(...imapResult.errors);
        }
      } catch (error) {
        results.imap.errors.push(`Config file error: ${error}`);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      paths: {
        generator: TM_GENERATOR_PATH,
        accountsCsv: process.env.TM_ACCOUNTS_CSV_PATH,
      },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync from tm-generator", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync/tm-generator
 * Check sync status and available files
 */
export async function GET() {
  try {
    const files: { path: string; exists: boolean; size?: number }[] = [];

    const checkFile = async (filePath: string, name: string) => {
      try {
        const stats = await fs.stat(filePath);
        files.push({ path: name, exists: true, size: stats.size });
      } catch {
        files.push({ path: name, exists: false });
      }
    };

    await Promise.all([
      checkFile(path.join(TM_GENERATOR_PATH, "config", "config.json"), "config.json"),
      checkFile(path.join(TM_GENERATOR_PATH, "output", "success.csv"), "output/success.csv"),
      checkFile(path.join(TM_GENERATOR_PATH, "data", "accounts.csv"), "data/accounts.csv"),
      checkFile(process.env.TM_ACCOUNTS_CSV_PATH || "", "tm_accounts.csv"),
    ]);

    return NextResponse.json({
      generatorPath: TM_GENERATOR_PATH,
      accountsCsvPath: process.env.TM_ACCOUNTS_CSV_PATH,
      files,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to check files", details: String(error) },
      { status: 500 }
    );
  }
}
