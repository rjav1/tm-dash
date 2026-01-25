import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const maxPosition = searchParams.get("maxPosition");
    const limit = parseInt(searchParams.get("limit") || "0", 10);

    // Build where clause
    const where: Record<string, unknown> = {};

    if (eventId) {
      where.eventId = eventId;
    }

    if (maxPosition) {
      where.position = { lte: parseInt(maxPosition, 10) };
    }

    // Get queue positions
    const queuePositions = await prisma.queuePosition.findMany({
      where,
      orderBy: { position: "asc" },
      take: limit || undefined,
      include: {
        account: {
          select: { email: true },
        },
        event: {
          select: { tmEventId: true },
        },
      },
      distinct: ["accountId"], // Only latest position per account
    });

    // Build tab-separated content (same format as Encore output)
    const content = queuePositions
      .map(
        (q) =>
          `${q.account.email}\t${q.event.tmEventId}\t${q.position}`
      )
      .join("\n");

    // Return as downloadable file
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="queues_export_${new Date().toISOString().split("T")[0]}.txt"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export queues" },
      { status: 500 }
    );
  }
}
