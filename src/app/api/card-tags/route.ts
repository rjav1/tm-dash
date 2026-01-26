import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/card-tags
 * List all card tags
 */
export async function GET() {
  try {
    const tags = await prisma.cardTag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { cards: true },
        },
      },
    });

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Error fetching card tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch card tags" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/card-tags
 * Create a new card tag
 * 
 * Body:
 * - name: string (required)
 * - color: string (optional hex color)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim().toLowerCase();

    // Check if tag already exists
    const existing = await prisma.cardTag.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A card tag with this name already exists" },
        { status: 409 }
      );
    }

    // Create the tag
    const tag = await prisma.cardTag.create({
      data: {
        name: trimmedName,
        color: color || null,
      },
    });

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error) {
    console.error("Error creating card tag:", error);
    return NextResponse.json(
      { error: "Failed to create card tag" },
      { status: 500 }
    );
  }
}
