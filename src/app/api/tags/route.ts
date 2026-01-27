/**
 * Tags API Route
 * 
 * Unified API for managing tags across different entity types:
 * - account: AccountTag
 * - card: CardTag
 * - queue: QueueTag
 * 
 * GET /api/tags?type=account|card|queue - List all tags of a type
 * POST /api/tags - Create a new tag
 * PATCH /api/tags - Update a tag
 * DELETE /api/tags - Delete a tag
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Default tag colors for auto-generated tags
const TAG_COLORS = {
  // Status tags
  tested: "#3B82F6",      // Blue
  purchased: "#10B981",   // Green
  
  // Count tags  
  "1-purchase": "#F59E0B",   // Amber
  "2-purchases": "#F97316",  // Orange
  "3+-purchases": "#EF4444", // Red
  
  // Card types
  visa: "#1A1F71",        // Visa blue
  mastercard: "#EB001B",  // Mastercard red
  amex: "#006FCF",        // Amex blue
  discover: "#FF6600",    // Discover orange
  
  // Default
  default: "#6B7280",     // Gray
};

type TagType = "account" | "card" | "queue";

function getTagModel(type: TagType) {
  switch (type) {
    case "account":
      return prisma.accountTag;
    case "card":
      return prisma.cardTag;
    case "queue":
      return prisma.queueTag;
    default:
      throw new Error(`Invalid tag type: ${type}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as TagType;
    const search = searchParams.get("search") || "";

    if (!type || !["account", "card", "queue"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing tag type" },
        { status: 400 }
      );
    }

    const model = getTagModel(type);
    
    const where = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {};

    // @ts-expect-error - Prisma dynamic model access
    const tags = await model.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      tags,
      defaultColors: TAG_COLORS,
    });
  } catch (error) {
    console.error("[Tags API] GET error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, color } = body as { type: TagType; name: string; color?: string };

    if (!type || !["account", "card", "queue"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing tag type" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Tag name is required" },
        { status: 400 }
      );
    }

    const model = getTagModel(type);
    const trimmedName = name.trim();

    // Check if tag already exists
    // @ts-expect-error - Prisma dynamic model access
    const existing = await model.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Tag with this name already exists" },
        { status: 409 }
      );
    }

    // Create the tag
    // @ts-expect-error - Prisma dynamic model access
    const tag = await model.create({
      data: {
        name: trimmedName,
        color: color || TAG_COLORS.default,
      },
    });

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error) {
    console.error("[Tags API] POST error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create tag" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, name, color } = body as { type: TagType; id: string; name?: string; color?: string };

    if (!type || !["account", "card", "queue"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing tag type" },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Tag ID is required" },
        { status: 400 }
      );
    }

    const model = getTagModel(type);

    const updateData: { name?: string; color?: string } = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;

    // @ts-expect-error - Prisma dynamic model access
    const tag = await model.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error) {
    console.error("[Tags API] PATCH error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update tag" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id } = body as { type: TagType; id: string };

    if (!type || !["account", "card", "queue"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing tag type" },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Tag ID is required" },
        { status: 400 }
      );
    }

    const model = getTagModel(type);

    // @ts-expect-error - Prisma dynamic model access
    await model.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Tag deleted",
    });
  } catch (error) {
    console.error("[Tags API] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete tag" },
      { status: 500 }
    );
  }
}
