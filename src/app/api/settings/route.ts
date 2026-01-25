import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/settings
 * Fetch all application settings as key-value pairs
 * 
 * Response:
 * - settings: Object with setting keys and their values
 */
export async function GET() {
  try {
    // Default settings
    const settingsObj: Record<string, string> = {
      marketplace_fee_percentage: "7",
    };
    
    try {
      const settings = await prisma.setting.findMany();
      // Override defaults with stored values
      settings.forEach(setting => {
        settingsObj[setting.key] = setting.value;
      });
    } catch (e) {
      // Settings table might not exist yet, use defaults
      console.log("Settings table not available, using defaults:", e);
    }

    return NextResponse.json({ settings: settingsObj });
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json(
      { error: "Failed to get settings" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * Create or update a setting
 * 
 * Request Body:
 * - key: Setting key (e.g., "marketplace_fee_percentage")
 * - value: Setting value (string)
 * 
 * Response:
 * - setting: The updated setting { key, value }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "Key and value are required" },
        { status: 400 }
      );
    }

    // Validate specific settings
    if (key === "marketplace_fee_percentage") {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        return NextResponse.json(
          { error: "Marketplace fee must be between 0 and 100" },
          { status: 400 }
        );
      }
    }

    const valueStr = String(value);
    
    // Upsert the setting
    await prisma.setting.upsert({
      where: { key },
      update: { value: valueStr },
      create: { key, value: valueStr },
    });

    return NextResponse.json({ setting: { key, value: valueStr } });
  } catch (error) {
    console.error("Update setting error:", error);
    return NextResponse.json(
      { error: "Failed to update setting" },
      { status: 500 }
    );
  }
}
