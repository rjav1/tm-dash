/**
 * Parser for card_profiles.csv files (unlinked cards without email)
 * Format: Profile Name,Card Type,Card Number,Expiration Month,Expiration Year,CVV,Billing Name,Billing Phone,Billing Address,Billing Post Code,Billing City,Billing State
 */

import Papa from "papaparse";

export interface CardProfileEntry {
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

export function parseCardProfilesFile(content: string): CardProfileEntry[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const entries: CardProfileEntry[] = [];

  for (const row of result.data) {
    const profileName = row["Profile Name"]?.trim();
    const cardNumber = row["Card Number"]?.trim();

    // Skip rows without profile name or card number
    if (!profileName || !cardNumber) continue;

    entries.push({
      profileName,
      cardType: row["Card Type"]?.trim() || "Visa",
      cardNumber,
      expMonth: row["Expiration Month"]?.trim() || "",
      expYear: row["Expiration Year"]?.trim() || "",
      cvv: row["CVV"]?.trim() || "",
      billingName: row["Billing Name"]?.trim() || "",
      billingPhone: row["Billing Phone"]?.trim() || "",
      billingAddress: row["Billing Address"]?.trim() || "",
      billingZip: row["Billing Post Code"]?.trim() || "",
      billingCity: row["Billing City"]?.trim() || "",
      billingState: row["Billing State"]?.trim() || "",
    });
  }

  return entries;
}
