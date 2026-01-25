/**
 * Seed script to import existing data from tm-checkout and tm-generator
 * Run with: npm run db:seed
 */

import { PrismaClient, AccountStatus, PurchaseStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Paths relative to tm-accounts directory
const PROFILES_PATH = "../tm-checkout/discord-bot/extensions/profiles.csv";
const QUEUES_PATH = "../queues.txt"; // Adjust this path as needed
const EXPORTS_DIR = "../tm-checkout/discord-bot/exports";

interface ProfileRow {
  email: string;
  profileName: string;
  cardType: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  billingName: string;
  billingPhone: string;
  billingAddress: string;
  billingZip: string;
  billingCity: string;
  billingState: string;
}

interface QueueEntry {
  email: string;
  eventId: string;
  position: number;
}

interface PurchaseRow {
  jobId: string;
  status: string;
  email: string;
  eventName: string;
  eventDate: string;
  venue: string;
  quantity: number;
  priceEach: number;
  totalPrice: number;
  section: string;
  row: string;
  seats: string;
  errorCode: string;
  errorMessage: string;
  checkoutUrl: string;
  confirmationUrl: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  attemptCount: number;
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });
    rows.push(row);
  }

  return rows;
}

async function importProfiles() {
  const profilesPath = path.resolve(__dirname, "..", PROFILES_PATH);

  if (!fs.existsSync(profilesPath)) {
    console.log(`Profiles file not found at ${profilesPath}, skipping...`);
    return;
  }

  console.log("Importing profiles from", profilesPath);
  const content = fs.readFileSync(profilesPath, "utf-8");
  const rows = parseCSV(content);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = row["Email Address"]?.toLowerCase().trim();
    const cardNumber = row["Card Number"]?.trim();

    if (!email || !cardNumber) {
      skipped++;
      continue;
    }

    // Upsert account
    const account = await prisma.account.upsert({
      where: { email },
      create: {
        email,
        status: AccountStatus.ACTIVE,
      },
      update: {},
    });

    // Upsert card by cardNumber (accounts can have multiple cards)
    await prisma.card.upsert({
      where: { cardNumber },
      create: {
        accountId: account.id,
        profileName: row["Profile Name"] || "",
        cardType: row["Card Type"] || "Visa",
        cardNumber,
        expMonth: row["Expiration Month"] || "",
        expYear: row["Expiration Year"] || "",
        cvv: row["CVV"] || "",
        billingName: row["Billing Name"] || "",
        billingPhone: row["Billing Phone"] || "",
        billingAddress: row["Billing Address"] || "",
        billingZip: row["Billing Post Code"] || "",
        billingCity: row["Billing City"] || "",
        billingState: row["Billing State"] || "",
      },
      update: {
        accountId: account.id,
        profileName: row["Profile Name"] || "",
        cardType: row["Card Type"] || "Visa",
        expMonth: row["Expiration Month"] || "",
        expYear: row["Expiration Year"] || "",
        cvv: row["CVV"] || "",
        billingName: row["Billing Name"] || "",
        billingPhone: row["Billing Phone"] || "",
        billingAddress: row["Billing Address"] || "",
        billingZip: row["Billing Post Code"] || "",
        billingCity: row["Billing City"] || "",
        billingState: row["Billing State"] || "",
      },
    });

    imported++;
  }

  console.log(`Profiles: ${imported} imported, ${skipped} skipped`);
}

async function importQueues() {
  const queuesPath = path.resolve(__dirname, "..", QUEUES_PATH);

  if (!fs.existsSync(queuesPath)) {
    console.log(`Queues file not found at ${queuesPath}, skipping...`);
    return;
  }

  console.log("Importing queues from", queuesPath);
  const content = fs.readFileSync(queuesPath, "utf-8");
  const lines = content.trim().split("\n");

  let imported = 0;
  let skipped = 0;

  // Group by event ID to create events first
  const eventIds = new Set<string>();
  const entries: QueueEntry[] = [];

  for (const line of lines) {
    const parts = line.trim().split("\t");
    if (parts.length !== 3) continue;

    const [email, eventId, positionStr] = parts;
    const position = parseInt(positionStr, 10);

    if (isNaN(position)) continue;

    eventIds.add(eventId.trim());
    entries.push({
      email: email.trim().toLowerCase(),
      eventId: eventId.trim(),
      position,
    });
  }

  // Create events
  for (const eventId of eventIds) {
    await prisma.event.upsert({
      where: { tmEventId: eventId },
      create: {
        tmEventId: eventId,
        eventName: `Event ${eventId}`, // Placeholder name
      },
      update: {},
    });
  }

  // Import queue positions
  for (const entry of entries) {
    // Get or create account
    const account = await prisma.account.upsert({
      where: { email: entry.email },
      create: {
        email: entry.email,
        status: AccountStatus.ACTIVE,
      },
      update: {},
    });

    const event = await prisma.event.findUnique({
      where: { tmEventId: entry.eventId },
    });

    if (!event) {
      skipped++;
      continue;
    }

    // Create queue position
    await prisma.queuePosition.create({
      data: {
        accountId: account.id,
        eventId: event.id,
        position: entry.position,
        source: "seed-import",
      },
    });

    imported++;
  }

  console.log(`Queue positions: ${imported} imported, ${skipped} skipped`);
}

async function importPurchases() {
  const exportsDir = path.resolve(__dirname, "..", EXPORTS_DIR);

  if (!fs.existsSync(exportsDir)) {
    console.log(`Exports directory not found at ${exportsDir}, skipping...`);
    return;
  }

  const files = fs.readdirSync(exportsDir).filter((f) => f.endsWith(".csv"));
  console.log(`Found ${files.length} export files to import`);

  let totalImported = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(exportsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const rows = parseCSV(content);

    for (const row of rows) {
      const email = row["Account Email"]?.toLowerCase().trim();
      const jobId = row["Job ID"]?.trim();

      if (!email || !jobId) {
        totalSkipped++;
        continue;
      }

      // Get or create account
      const account = await prisma.account.upsert({
        where: { email },
        create: {
          email,
          status: AccountStatus.ACTIVE,
        },
        update: {},
      });

      // Get first active card for this account if exists
      const card = await prisma.card.findFirst({
        where: { 
          accountId: account.id,
          deletedAt: null,
        },
      });

      // Parse price
      const parseCurrency = (val: string): number => {
        if (!val) return 0;
        return parseFloat(val.replace(/[$,]/g, "")) || 0;
      };

      // Check if purchase already exists (by externalJobId)
      const existing = await prisma.purchase.findFirst({
        where: { externalJobId: jobId },
      });

      if (existing) {
        totalSkipped++;
        continue;
      }

      // Parse dates
      const parseDate = (dateStr: string): Date | null => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      };

      await prisma.purchase.create({
        data: {
          accountId: account.id,
          cardId: card?.id,
          externalJobId: jobId,
          status:
            row["Status"]?.trim() === "SUCCESS"
              ? PurchaseStatus.SUCCESS
              : PurchaseStatus.FAILED,
          errorCode: row["Error Code"]?.trim() || null,
          errorMessage: row["Error Message"]?.trim() || null,
          quantity: parseInt(row["Quantity"]?.trim() || "1", 10) || 1,
          priceEach: parseCurrency(row["Price Each"]),
          totalPrice: parseCurrency(row["Total Price"]),
          section: row["Section"]?.trim() || null,
          row: row["Row"]?.trim() || null,
          seats: row["Seats"]?.trim() || null,
          checkoutUrl: row["Target URL"]?.trim() || null,
          confirmationUrl: row["Final URL"]?.trim() || null,
          createdAt: parseDate(row["Created At"]) || new Date(),
          startedAt: parseDate(row["Started At"]),
          completedAt: parseDate(row["Completed At"]),
          attemptCount:
            parseInt(row["Attempt Count"]?.trim() || "1", 10) || 1,
        },
      });

      totalImported++;
    }
  }

  console.log(
    `Purchases: ${totalImported} imported, ${totalSkipped} skipped`
  );
}

async function main() {
  console.log("Starting seed...\n");

  try {
    await importProfiles();
    await importQueues();
    await importPurchases();

    console.log("\nSeed completed successfully!");
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
