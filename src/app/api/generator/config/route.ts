import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Known config keys and their types (Capsolver removed)
const CONFIG_KEYS = [
  "daisy_sms_api_key",
  "daisy_sms_country",
  "daisy_sms_min_balance",
  "aycd_inbox_api_key",
  "aycd_inbox_enabled",
  "discord_webhook_success",
  "discord_webhook_error",
  "discord_webhook_misc",
  "imap_accounts", // JSON array
] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

/**
 * GET /api/generator/config
 * Fetch all generator configuration values
 */
export async function GET() {
  try {
    const configs = await prisma.generatorConfig.findMany();

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

    return NextResponse.json({ config: configMap });
  } catch (error) {
    console.error("Error fetching generator config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generator/config
 * Save generator configuration values
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
      await prisma.generatorConfig.upsert({
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
    console.error("Error saving generator config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}
