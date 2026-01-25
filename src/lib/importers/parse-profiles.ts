/**
 * Parser for profiles.csv files (tm-checkout format)
 * Format: Email Address,Profile Name,Card Type,Card Number,Expiration Month,Expiration Year,CVV,Billing Name,Billing Phone,Billing Address,Billing Post Code,Billing City,Billing State
 */

import Papa from "papaparse";

export interface ProfileEntry {
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

export function parseProfilesFile(content: string): ProfileEntry[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const entries: ProfileEntry[] = [];

  for (const row of result.data) {
    const email = row["Email Address"]?.trim().toLowerCase();
    const cardNumber = row["Card Number"]?.trim();

    // Skip rows without email or card number
    if (!email || !cardNumber) continue;

    entries.push({
      email,
      profileName: row["Profile Name"]?.trim() || "",
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
