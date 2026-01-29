import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/checkout/webhook
 * 
 * Called by the checkout daemon when a job completes. The dashboard handles
 * formatting and sending Discord webhooks so we don't need to update
 * the VPS every time we want to change webhook formatting.
 * 
 * Body: {
 *   type: "success" | "error" | "started",
 *   job_id: string,
 *   final_url?: string (for success),
 *   error_code?: string (for error),
 *   error_message?: string (for error),
 *   duration_seconds?: number,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,
      job_id,
      final_url,
      error_code,
      error_message,
      duration_seconds,
    } = body;

    if (!type || !job_id) {
      return NextResponse.json(
        { error: "Missing required fields: type, job_id" },
        { status: 400 }
      );
    }

    // Get the full job with all related data
    const job = await prisma.checkoutJob.findUnique({
      where: { id: job_id },
      include: {
        account: { select: { email: true } },
        card: { select: { last4: true, brand: true } },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get webhook URLs and device name from config
    const config = await prisma.checkoutConfig.findMany({
      where: {
        key: {
          in: ["discord_webhook_success", "discord_webhook_error", "discord_webhook_misc", "device_name"],
        },
      },
    });

    const configMap = Object.fromEntries(config.map((c) => [c.key, c.value]));
    const deviceName = configMap.device_name || "checkout-vps";

    // Determine which webhook URL to use
    const webhookUrl =
      type === "success"
        ? configMap.discord_webhook_success
        : type === "error"
        ? configMap.discord_webhook_error
        : configMap.discord_webhook_misc;

    if (!webhookUrl) {
      return NextResponse.json({
        success: true,
        message: `No webhook URL configured for type: ${type}`,
        sent: false,
      });
    }

    // Build and send webhook
    const embed = buildWebhookEmbed(type, {
      job,
      finalUrl: final_url,
      errorCode: error_code,
      errorMessage: error_message,
      durationSeconds: duration_seconds,
      deviceName,
    });

    await sendDiscordWebhook(webhookUrl, embed);

    return NextResponse.json({
      success: true,
      message: `Webhook sent for ${type}`,
      sent: true,
    });
  } catch (error) {
    console.error("Checkout webhook error:", error);
    return NextResponse.json(
      { error: "Failed to send webhook" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

// Brand colors
const COLORS = {
  success: 0x00d166, // Green
  error: 0xed4245,   // Red
  warning: 0xfee75c, // Yellow
  info: 0x5865f2,    // Blurple
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatEventDate(dateStr: string | Date | null): string {
  if (!dateStr) return "";
  try {
    const dt = new Date(dateStr);
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return String(dateStr).slice(0, 20);
  }
}

function getErrorEmoji(errorCode: string): string {
  const errorMap: Record<string, string> = {
    CARD_DECLINED: "💳",
    NO_CARD: "💳",
    SOLD_OUT: "🎫",
    TIMEOUT: "⏱️",
    BROWSER_ERROR: "🖥️",
    LOGIN_FAILED: "🔐",
    CAPTCHA: "🤖",
    PRICE_MISMATCH: "💰",
    QUEUE_TIMEOUT: "⏳",
    NO_TICKETS: "🎟️",
  };
  return errorMap[errorCode] || "❌";
}

interface WebhookJobData {
  job: {
    id: string;
    eventName: string | null;
    eventDate: Date | null;
    venue: string | null;
    section: string | null;
    row: string | null;
    quantity: number;
    totalPrice: number | null;
    account: { email: string } | null;
    card: { last4: string | null; brand: string | null } | null;
  };
  finalUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  durationSeconds?: number;
  deviceName: string;
}

function buildWebhookEmbed(type: string, data: WebhookJobData) {
  const { job, durationSeconds, deviceName } = data;
  
  const eventName = job.eventName || "Unknown Event";
  const eventDateDisplay = formatEventDate(job.eventDate);
  const venue = job.venue || "";
  const section = job.section || "N/A";
  const row = job.row || "N/A";
  const quantity = job.quantity || 1;
  const totalPrice = job.totalPrice || 0;
  const pricePerTicket = quantity > 0 && totalPrice ? totalPrice / quantity : 0;
  const cardLast4 = job.card?.last4 || "????";
  const cardType = (job.card?.brand || "Card").toUpperCase();
  const accountEmail = job.account?.email || "N/A";
  const seatInfo = section !== "N/A" ? `Sec ${section} • Row ${row}` : "Best Available";

  if (type === "success") {
    const fields = [
      { name: "🎫 Tickets", value: `\`\`\`\n${quantity}x ${seatInfo}\n\`\`\``, inline: false },
      { name: "💵 Total", value: `\`\`\`\n$${totalPrice.toFixed(2)}\n\`\`\``, inline: true },
      { name: "💰 Per Ticket", value: `\`\`\`\n$${pricePerTicket.toFixed(2)}\n\`\`\``, inline: true },
      { name: "💳 Payment", value: `\`\`\`\n${cardType} ****${cardLast4}\n\`\`\``, inline: true },
      { name: "👤 Account", value: accountEmail.length > 30 ? `\`${accountEmail.slice(0, 30)}...\`` : `\`${accountEmail}\``, inline: true },
      { name: "🖥️ Worker", value: `\`${deviceName}\``, inline: true },
    ];

    if (durationSeconds) {
      fields.push({ name: "⏱️ Duration", value: `\`${formatDuration(durationSeconds)}\``, inline: true });
    }

    return {
      embeds: [{
        author: { name: "TM Checkout • Purchase Complete" },
        title: `✅ ${eventName.slice(0, 80)}`,
        description: venue || eventDateDisplay ? `**${venue}**\n${eventDateDisplay}` : undefined,
        color: COLORS.success,
        fields,
        footer: { text: `Duration: ${durationSeconds ? formatDuration(durationSeconds) : "N/A"} • Order placed` },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (type === "error") {
    const errorCode = data.errorCode || "UNKNOWN";
    const errorMessage = (data.errorMessage || "Unknown error").slice(0, 300);
    const errorEmoji = getErrorEmoji(errorCode);

    const fields = [
      { name: `🏷️ Error: ${errorCode}`, value: `\`\`\`\n${errorMessage}\n\`\`\``, inline: false },
      { name: "🎫 Attempted", value: `\`${quantity}x Sec ${section} Row ${row}\``, inline: true },
      { name: "💳 Card", value: `\`****${cardLast4}\``, inline: true },
      { name: "👤 Account", value: accountEmail.length > 20 ? `\`${accountEmail.slice(0, 20)}...\`` : `\`${accountEmail}\``, inline: true },
      { name: "🖥️ Worker", value: `\`${deviceName}\``, inline: true },
    ];

    if (durationSeconds) {
      fields.push({ name: "⏱️ Duration", value: `\`${formatDuration(durationSeconds)}\``, inline: true });
    }

    return {
      embeds: [{
        author: { name: "TM Checkout • Checkout Failed" },
        title: `${errorEmoji} ${eventName.slice(0, 60)}`,
        color: COLORS.error,
        fields,
        footer: { text: `Duration: ${durationSeconds ? formatDuration(durationSeconds) : "N/A"} • Job ID: ${job.id.slice(0, 8)}` },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (type === "started") {
    return {
      embeds: [{
        author: { name: "TM Checkout • Processing" },
        title: `🔄 ${eventName.slice(0, 60)}`,
        color: COLORS.info,
        fields: [
          { name: "🎫 Target", value: `\`${quantity}x Sec ${section} Row ${row}\``, inline: true },
          { name: "🖥️ Worker", value: `\`${deviceName}\``, inline: true },
        ],
        footer: { text: "Checkout in progress..." },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  // Fallback
  return {
    embeds: [{
      title: `${type}: ${eventName}`,
      color: COLORS.info,
      timestamp: new Date().toISOString(),
    }],
  };
}

async function sendDiscordWebhook(url: string, payload: object) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} - ${text}`);
  }
}
