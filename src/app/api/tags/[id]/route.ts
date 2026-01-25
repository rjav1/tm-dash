import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tags/[id]
 * Get a single tag with account count
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const tag = await prisma.accountTag.findUnique({
      where: { id },
      include: {
        _count: {
          select: { accounts: true, generatorJobs: true },
        },
      },
    });

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ tag });
  } catch (error) {
    console.error("Error fetching tag:", error);
    return NextResponse.json(
      { error: "Failed to fetch tag" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tags/[id]
 * Update a tag
 * 
 * Body:
 * - name: string (optional)
 * - color: string (optional)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, color } = body;

    // Check if tag exists
    const existing = await prisma.accountTag.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Check for name conflict if name is being changed
    if (name && name !== existing.name) {
      const conflict = await prisma.accountTag.findUnique({
        where: { name: name.trim() },
      });
      if (conflict) {
        return NextResponse.json(
          { error: "A tag with this name already exists" },
          { status: 409 }
        );
      }
    }

    // Update the tag
    const tag = await prisma.accountTag.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(color !== undefined && { color }),
      },
    });

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error) {
    console.error("Error updating tag:", error);
    return NextResponse.json(
      { error: "Failed to update tag" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tags/[id]
 * Delete a tag (will unlink from accounts but not delete them)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if tag exists
    const tag = await prisma.accountTag.findUnique({
      where: { id },
    });

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Delete the tag (Prisma handles unlinking from accounts)
    await prisma.accountTag.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Tag deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json(
      { error: "Failed to delete tag" },
      { status: 500 }
    );
  }
}
