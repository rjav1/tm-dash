import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/generator/config/test-webhook
 * Test a Discord webhook URL by sending a test message
 * 
 * Body:
 * - webhookUrl: string (Discord webhook URL)
 * - type: "success" | "error" | "misc" (optional, for customizing the test message)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhookUrl, type = "misc" } = body;

    if (!webhookUrl || typeof webhookUrl !== "string") {
      return NextResponse.json(
        { error: "Webhook URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      return NextResponse.json(
        { error: "Invalid Discord webhook URL format" },
        { status: 400 }
      );
    }

    // Build test embed based on type
    const colors: Record<string, number> = {
      success: 0x00ff00, // Green
      error: 0xff0000, // Red
      misc: 0x0099ff, // Blue
    };

    const titles: Record<string, string> = {
      success: "Test Success Webhook",
      error: "Test Error Webhook",
      misc: "Test Misc Webhook",
    };

    const embed = {
      title: titles[type] || titles.misc,
      description: "This is a test message from TM Accounts Dashboard. If you see this, your webhook is configured correctly!",
      color: colors[type] || colors.misc,
      timestamp: new Date().toISOString(),
      footer: {
        text: "TM Generator • Webhook Test",
      },
    };

    // Send test message to webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { 
          success: false, 
          error: `Discord returned error: ${response.status} ${errorText}` 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Test message sent successfully! Check your Discord channel.",
    });
  } catch (error) {
    console.error("Error testing webhook:", error);
    return NextResponse.json(
      { error: "Failed to send test message to webhook" },
      { status: 500 }
    );
  }
}
