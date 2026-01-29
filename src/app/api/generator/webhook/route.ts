import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/generator/webhook
 * 
 * Called by the daemon when a task completes. The dashboard handles
 * formatting and sending Discord webhooks so we don't need to update
 * the VPS every time we want to change webhook formatting.
 * 
 * Body: {
 *   type: "success" | "error" | "requeue",
 *   task_id: string,
 *   job_id: string,
 *   email: string,
 *   password?: string (for success),
 *   error?: string (for error),
 *   worker_name?: string,
 *   duration_seconds?: number,
 *   retry_count?: number,
 *   first_name?: string,
 *   last_name?: string,
 *   phone?: string,
 *   imap_source?: string,
 *   tag_name?: string,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,
      job_id,
      email,
      password,
      error,
      worker_name,
      duration_seconds,
      retry_count = 0,
      first_name,
      last_name,
      phone,
      imap_source,
      tag_name,
    } = body;

    if (!type || !job_id || !email) {
      return NextResponse.json(
        { error: "Missing required fields: type, job_id, email" },
        { status: 400 }
      );
    }

    // Get webhook URLs from config
    const config = await prisma.generatorConfig.findMany({
      where: {
        key: {
          in: ["discord_webhook_success", "discord_webhook_error", "discord_webhook_misc", "device_name"],
        },
      },
    });

    const configMap = Object.fromEntries(config.map((c) => [c.key, c.value]));
    const deviceName = configMap.device_name || "generator-vps";

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

    // Get job stats
    const jobStats = await getJobStats(job_id);

    // Build and send webhook
    const embed = buildWebhookEmbed(type, {
      email,
      password,
      error,
      worker_name: worker_name || deviceName,
      duration_seconds,
      retry_count,
      first_name,
      last_name,
      phone,
      imap_source,
      tag_name,
      jobStats,
      deviceName,
    });

    await sendDiscordWebhook(webhookUrl, embed);

    return NextResponse.json({
      success: true,
      message: `Webhook sent for ${type}`,
      sent: true,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to send webhook" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

interface JobStats {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  successRate: number;
  progressPct: number;
}

async function getJobStats(jobId: string): Promise<JobStats> {
  const tasks = await prisma.generatorTask.findMany({
    where: { jobId },
    select: { status: true },
  });

  const total = tasks.length;
  const succeeded = tasks.filter((t) => t.status === "SUCCESS").length;
  const failed = tasks.filter((t) => t.status === "FAILED").length;
  const completed = succeeded + failed;
  const successRate = completed > 0 ? (succeeded / completed) * 100 : 0;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;

  return { total, completed, succeeded, failed, successRate, progressPct };
}

function progressBar(current: number, total: number, length: number = 10): string {
  if (total === 0) return "░".repeat(length);
  const filled = Math.round((current / total) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function categorizeError(error: string): { category: string; emoji: string } {
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes("otp") || errorLower.includes("verification code")) {
    return { category: "OTP Error", emoji: "📱" };
  }
  if (errorLower.includes("captcha")) {
    return { category: "Captcha", emoji: "🤖" };
  }
  if (errorLower.includes("email") || errorLower.includes("imap")) {
    return { category: "Email Error", emoji: "📧" };
  }
  if (errorLower.includes("proxy") || errorLower.includes("banned") || errorLower.includes("soft-ban")) {
    return { category: "Proxy/Ban", emoji: "🌐" };
  }
  if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
    return { category: "Timeout", emoji: "⏰" };
  }
  if (errorLower.includes("browser") || errorLower.includes("chrome")) {
    return { category: "Browser Error", emoji: "🖥️" };
  }
  if (errorLower.includes("phone") || errorLower.includes("sms")) {
    return { category: "Phone Error", emoji: "📞" };
  }
  return { category: "Error", emoji: "❌" };
}

interface WebhookData {
  email: string;
  password?: string;
  error?: string;
  worker_name: string;
  duration_seconds?: number;
  retry_count: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  imap_source?: string;
  tag_name?: string;
  jobStats: JobStats;
  deviceName: string;
}

// Brand colors
const COLORS = {
  success: 0x00d166, // Green
  error: 0xed4245,   // Red
  warning: 0xfee75c, // Yellow
  info: 0x5865f2,    // Blurple
  requeue: 0xeb459e, // Fuchsia
};

function buildWebhookEmbed(type: string, data: WebhookData) {
  const { jobStats } = data;
  const bar = progressBar(jobStats.completed, jobStats.total);
  
  // Common progress field
  const progressField = {
    name: jobStats.successRate >= 90 ? "🔥 Job Progress" : jobStats.successRate >= 70 ? "✨ Job Progress" : "📈 Job Progress",
    value: `\`\`\`\n${bar} ${jobStats.completed}/${jobStats.total} (${jobStats.progressPct.toFixed(1)}%)\n✅ ${jobStats.succeeded} success • ❌ ${jobStats.failed} failed • ${jobStats.successRate.toFixed(0)}% rate\n\`\`\``,
    inline: false,
  };

  if (type === "success") {
    const fields = [
      { name: "🔐 Credentials", value: `\`\`\`\n${data.email}\n${data.password}\n\`\`\``, inline: false },
    ];

    if (data.first_name || data.last_name) {
      fields.push({ name: "👤 Name", value: `\`${data.first_name || ""} ${data.last_name || ""}\``.trim(), inline: true });
    }
    if (data.phone) {
      fields.push({ name: "📱 Phone", value: `\`${data.phone}\``, inline: true });
    }
    if (data.imap_source) {
      fields.push({ name: "📨 Source", value: `\`${data.imap_source}\``, inline: true });
    }
    
    fields.push({ name: "🖥️ Worker", value: `\`${data.worker_name}\``, inline: true });
    
    if (data.duration_seconds) {
      fields.push({ name: "⏱️ Duration", value: `\`${formatDuration(data.duration_seconds)}\``, inline: true });
    }
    if (data.tag_name) {
      fields.push({ name: "🏷️ Tag", value: `\`${data.tag_name}\``, inline: true });
    }
    
    fields.push(progressField);

    return {
      embeds: [{
        author: { name: "TM Generator • Account Created" },
        title: `✅ ${data.email}`,
        color: COLORS.success,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: `Device: ${data.deviceName} • Job: ${jobStats.completed}/${jobStats.total}` },
      }],
    };
  }

  if (type === "error") {
    const { category, emoji } = categorizeError(data.error || "Unknown error");
    const errorDisplay = (data.error || "Unknown error").slice(0, 300);

    const fields = [
      { name: `🏷️ ${category}`, value: `\`\`\`\n${errorDisplay}\n\`\`\``, inline: false },
      { name: "📧 Email", value: `\`${data.email}\``, inline: true },
    ];

    if (data.imap_source) {
      fields.push({ name: "📨 Source", value: `\`${data.imap_source}\``, inline: true });
    }
    if (data.retry_count > 0) {
      fields.push({ name: "🔄 Attempt", value: `\`#${data.retry_count + 1}\``, inline: true });
    }
    
    fields.push({ name: "🖥️ Worker", value: `\`${data.worker_name}\``, inline: true });
    
    if (data.duration_seconds) {
      fields.push({ name: "⏱️ Duration", value: `\`${formatDuration(data.duration_seconds)}\``, inline: true });
    }
    if (data.tag_name) {
      fields.push({ name: "🏷️ Tag", value: `\`${data.tag_name}\``, inline: true });
    }
    
    fields.push(progressField);

    return {
      embeds: [{
        author: { name: "TM Generator • Generation Failed" },
        title: `${emoji} ${data.email}`,
        color: COLORS.error,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: `Device: ${data.deviceName} • Job: ${jobStats.completed}/${jobStats.total}` },
      }],
    };
  }

  if (type === "requeue") {
    return {
      embeds: [{
        author: { name: "TM Generator • Task Requeued" },
        title: `🔄 ${data.email}`,
        color: COLORS.requeue,
        fields: [
          { name: "📧 Email", value: `\`${data.email}\``, inline: true },
          { name: "🔢 Attempt", value: `\`#${data.retry_count + 1}\``, inline: true },
          { name: "🖥️ Worker", value: `\`${data.worker_name}\``, inline: true },
          progressField,
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Will retry with new proxy" },
      }],
    };
  }

  // Fallback for unknown type
  return {
    embeds: [{
      title: `${type}: ${data.email}`,
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
