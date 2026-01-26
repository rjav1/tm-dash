import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Known config keys for checkout
const CONFIG_KEYS = [
  // Discord settings
  "discord_token",
  "discord_watch_channel_ids", // JSON array
  "discord_allowed_author_ids", // JSON array
  
  // Timeouts (in milliseconds)
  "navigation_timeout",
  "redirect_timeout",
  "success_timeout",
  
  // Worker settings
  "max_retries",
  "auto_link_cards", // boolean
  "amex_only", // boolean - only use cards tagged as "amex"
  "worker_parallelism", // number of parallel workers
  
  // Discord webhooks for notifications
  "discord_webhook_success",
  "discord_webhook_error",
  "discord_webhook_misc",
  
  // Extension/browser settings
  "headless_mode", // boolean
  "browser_proxy", // proxy string for browser
] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

/**
 * GET /api/checkout/config
 * Fetch all checkout configuration values
 */
export async function GET() {
  try {
    const configs = await prisma.checkoutConfig.findMany();

    // Build a config object
    const configMap: Record<string, string | number | boolean | object> = {};
    for (const config of configs) {
      // Try to parse JSON values
      try {
        configMap[config.key] = JSON.parse(config.value);
      } catch {
        configMap[config.key] = config.value;
      }
    }

    // Return with defaults for unset values
    const result: Record<string, unknown> = {
      // Discord defaults
      discord_token: "",
      discord_watch_channel_ids: [],
      discord_allowed_author_ids: [],
      
      // Timeout defaults (in ms)
      navigation_timeout: 30000,
      redirect_timeout: 5000,
      success_timeout: 60000,
      
      // Worker defaults
      max_retries: 3,
      auto_link_cards: true,
      amex_only: false,
      worker_parallelism: 1,
      
      // Webhook defaults
      discord_webhook_success: "",
      discord_webhook_error: "",
      discord_webhook_misc: "",
      
      // Browser defaults
      headless_mode: false,
      browser_proxy: "",
      
      // Override with stored values
      ...configMap,
    };

    return NextResponse.json({ config: result });
  } catch (error) {
    console.error("Error fetching checkout config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/checkout/config
 * Save checkout configuration values
 * 
 * Body: Record<string, any> of config keys and values
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Upsert each config value
    const updates: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(body)) {
      // Validate key
      if (!CONFIG_KEYS.includes(key as ConfigKey)) {
        continue; // Skip unknown keys
      }

      // Convert value to string (JSON for objects/arrays)
      const stringValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      updates.push({ key, value: stringValue });
    }

    // Perform upserts
    for (const update of updates) {
      await prisma.checkoutConfig.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updates.length} configuration values`,
      updated: updates.map((u) => u.key),
    });
  } catch (error) {
    console.error("Error saving checkout config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}
