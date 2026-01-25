import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/checkout/config/test-webhook
 * Send a test message to a Discord webhook URL
 * 
 * Body:
 * - webhookUrl: string (Discord webhook URL)
 * - type: "success" | "error" | "misc" (optional, for different message styles)
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
        { error: "Invalid Discord webhook URL" },
        { status: 400 }
      );
    }

    // Build test embed based on type
    const timestamp = new Date().toISOString();
    let embed;

    switch (type) {
      case "success":
        embed = {
          title: "✅ Checkout Success Test",
          description: "This is a test message from TM Dashboard checkout system.",
          color: 0x00ff00, // Green
          fields: [
            { name: "Event", value: "Test Event - Artist Name", inline: true },
            { name: "Section/Row", value: "Floor A / Row 1", inline: true },
            { name: "Quantity", value: "2 tickets", inline: true },
            { name: "Total", value: "$150.00", inline: true },
          ],
          timestamp,
          footer: { text: "TM Checkout Dashboard" },
        };
        break;

      case "error":
        embed = {
          title: "❌ Checkout Error Test",
          description: "This is a test error notification from TM Dashboard.",
          color: 0xff0000, // Red
          fields: [
            { name: "Event", value: "Test Event - Artist Name", inline: true },
            { name: "Error Code", value: "PAYMENT_DECLINED", inline: true },
            { name: "Message", value: "Card was declined", inline: false },
          ],
          timestamp,
          footer: { text: "TM Checkout Dashboard" },
        };
        break;

      default:
        embed = {
          title: "🔔 Checkout Webhook Test",
          description: "This is a test message from TM Dashboard checkout configuration.",
          color: 0x5865f2, // Discord blurple
          fields: [
            { name: "Status", value: "Webhook is working correctly!", inline: true },
            { name: "Timestamp", value: new Date().toLocaleString(), inline: true },
          ],
          timestamp,
          footer: { text: "TM Checkout Dashboard" },
        };
    }

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
        { error: `Webhook failed: ${response.status} - ${errorText}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Test message sent successfully",
    });
  } catch (error) {
    console.error("Error testing webhook:", error);
    return NextResponse.json(
      { error: "Failed to send test message" },
      { status: 500 }
    );
  }
}
