/**
 * Parser for tm-generator config.json IMAP credentials
 * Format:
 * {
 *   "imap_accounts": {
 *     "email@gmail.com": {
 *       "password": "app_password",
 *       "enabled": true
 *     }
 *   },
 *   "aycd_inbox": {
 *     "api_key": "...",
 *     "enabled": true
 *   }
 * }
 */

export interface ImapCredentialEntry {
  email: string;
  password: string;
  provider: string; // "gmail", "outlook", derived from email domain or explicit
  isEnabled: boolean;
}

export interface AycdInboxConfig {
  apiKey: string;
  isEnabled: boolean;
}

export interface ImapConfigResult {
  imapCredentials: ImapCredentialEntry[];
  aycdInbox: AycdInboxConfig | null;
  errors: string[];
}

export function parseImapConfig(content: string): ImapConfigResult {
  const errors: string[] = [];
  const imapCredentials: ImapCredentialEntry[] = [];
  let aycdInbox: AycdInboxConfig | null = null;

  try {
    const config = JSON.parse(content);

    // Parse IMAP accounts
    if (config.imap_accounts && typeof config.imap_accounts === "object") {
      for (const [email, accountConfig] of Object.entries(config.imap_accounts)) {
        if (!email || typeof email !== "string") {
          errors.push(`Invalid IMAP account email: ${email}`);
          continue;
        }

        const account = accountConfig as Record<string, unknown>;
        const password = account.password as string;
        const enabled = account.enabled as boolean ?? true;

        if (!password || password === "YOUR_APP_PASSWORD_HERE") {
          // Skip placeholder passwords
          continue;
        }

        // Derive provider from email domain
        const provider = deriveProvider(email);

        imapCredentials.push({
          email: email.toLowerCase(),
          password,
          provider,
          isEnabled: enabled,
        });
      }
    }

    // Parse AYCD Inbox config
    if (config.aycd_inbox && typeof config.aycd_inbox === "object") {
      const aycd = config.aycd_inbox as Record<string, unknown>;
      const apiKey = aycd.api_key as string;
      const enabled = aycd.enabled as boolean ?? false;

      if (apiKey && apiKey.length > 0) {
        aycdInbox = {
          apiKey,
          isEnabled: enabled,
        };

        // Add AYCD as a special IMAP credential
        imapCredentials.push({
          email: "aycd",
          password: apiKey,
          provider: "aycd",
          isEnabled: enabled,
        });
      }
    }
  } catch (error) {
    errors.push(`Failed to parse config JSON: ${error}`);
  }

  return {
    imapCredentials,
    aycdInbox,
    errors,
  };
}

/**
 * Derive IMAP provider from email domain
 */
function deriveProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) return "unknown";

  if (domain.includes("gmail.com")) return "gmail";
  if (domain.includes("outlook.com") || domain.includes("hotmail.com") || domain.includes("live.com")) {
    return "outlook";
  }
  if (domain.includes("yahoo.com")) return "yahoo";
  if (domain.includes("icloud.com") || domain.includes("me.com")) return "icloud";
  if (domain.includes("aol.com")) return "aol";

  return "other";
}

/**
 * Parse IMAP config from a file path (for server-side use)
 */
export async function parseImapConfigFromFile(filePath: string): Promise<ImapConfigResult> {
  const fs = await import("fs/promises");
  
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return parseImapConfig(content);
  } catch (error) {
    return {
      imapCredentials: [],
      aycdInbox: null,
      errors: [`Failed to read config file: ${error}`],
    };
  }
}
