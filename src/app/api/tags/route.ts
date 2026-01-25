import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/tags
 * List all account tags
 */
export async function GET() {
  try {
    const tags = await prisma.accountTag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { accounts: true, generatorJobs: true },
        },
      },
    });

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tags
 * Create a new tag
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

    const trimmedName = name.trim();

    // Check if tag already exists
    const existing = await prisma.accountTag.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A tag with this name already exists" },
        { status: 409 }
      );
    }

    // Create the tag
    const tag = await prisma.accountTag.create({
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
    console.error("Error creating tag:", error);
    return NextResponse.json(
      { error: "Failed to create tag" },
      { status: 500 }
    );
  }
}
