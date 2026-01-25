/**
 * Parser for account CSV files
 * Supports multiple formats:
 * - tm_accounts.csv: Email,Password,CreationProxy,Imap,PhoneNumber
 * - tm-generator output: email,password,imap
 */

import Papa from "papaparse";

export interface AccountEntry {
  email: string;
  password?: string;
  imapProvider?: string;
  phoneNumber?: string;
  creationProxy?: string;
}

export interface ParseResult<T> {
  data: T[];
  errors: ParseError[];
  stats: {
    total: number;
    parsed: number;
    errored: number;
  };
}

export interface ParseError {
  row: number;
  field?: string;
  message: string;
  rawData?: string;
}

export function parseAccountsFile(content: string): ParseResult<AccountEntry> {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const entries: AccountEntry[] = [];
  const errors: ParseError[] = [];
  let rowIndex = 1; // Start at 1 since row 0 is headers

  // Log available headers for debugging
  const headers = result.meta.fields || [];
  console.log("Available headers:", headers);

  for (const row of result.data) {
    rowIndex++;

    // Try multiple possible column names for email
    const email = (
      row["email"] ||
      row["email address"] ||
      row["emailaddress"] ||
      row["account"]
    )?.trim().toLowerCase();

    // Skip rows without email
    if (!email) {
      errors.push({
        row: rowIndex,
        field: "email",
        message: "Missing email address",
        rawData: JSON.stringify(row),
      });
      continue;
    }

    // Validate email format
    if (!email.includes("@")) {
      errors.push({
        row: rowIndex,
        field: "email",
        message: `Invalid email format: ${email}`,
        rawData: JSON.stringify(row),
      });
      continue;
    }

    // Get password from various possible column names
    const password = (
      row["password"] ||
      row["pass"] ||
      row["pwd"]
    )?.trim() || undefined;

    // Get IMAP provider - could be "aycd", a Gmail address, etc.
    const imapProvider = (
      row["imap"] ||
      row["imap_provider"] ||
      row["imapprovider"] ||
      row["imap provider"]
    )?.trim() || undefined;

    // Get phone number
    const phoneNumber = (
      row["phonenumber"] ||
      row["phone_number"] ||
      row["phone number"] ||
      row["phone"] ||
      row["number"]
    )?.trim() || undefined;

    // Get creation proxy - format: ip:port:user:pass
    const creationProxy = (
      row["creationproxy"] ||
      row["creation_proxy"] ||
      row["creation proxy"] ||
      row["proxy"]
    )?.trim() || undefined;

    entries.push({
      email,
      password,
      imapProvider,
      phoneNumber,
      creationProxy,
    });
  }

  // Also capture Papa parse errors
  if (result.errors && result.errors.length > 0) {
    for (const err of result.errors) {
      errors.push({
        row: err.row ?? -1,
        message: err.message,
      });
    }
  }

  return {
    data: entries,
    errors,
    stats: {
      total: result.data.length,
      parsed: entries.length,
      errored: errors.length,
    },
  };
}
