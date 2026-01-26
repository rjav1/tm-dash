import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/card-tags/:id
 * Get a single card tag with its cards
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const tag = await prisma.cardTag.findUnique({
      where: { id },
      include: {
        cards: {
          select: {
            id: true,
            profileName: true,
            cardNumber: true,
            cardType: true,
          },
        },
        _count: {
          select: { cards: true },
        },
      },
    });

    if (!tag) {
      return NextResponse.json(
        { error: "Card tag not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ tag });
  } catch (error) {
    console.error("Error fetching card tag:", error);
    return NextResponse.json(
      { error: "Failed to fetch card tag" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/card-tags/:id
 * Update a card tag
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

    const existing = await prisma.cardTag.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Card tag not found" },
        { status: 404 }
      );
    }

    // Check for duplicate name if changing
    if (name && name.trim().toLowerCase() !== existing.name) {
      const duplicate = await prisma.cardTag.findUnique({
        where: { name: name.trim().toLowerCase() },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "A card tag with this name already exists" },
          { status: 409 }
        );
      }
    }

    const tag = await prisma.cardTag.update({
      where: { id },
      data: {
        ...(name && { name: name.trim().toLowerCase() }),
        ...(color !== undefined && { color }),
      },
    });

    return NextResponse.json({
      success: true,
      tag,
    });
  } catch (error) {
    console.error("Error updating card tag:", error);
    return NextResponse.json(
      { error: "Failed to update card tag" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/card-tags/:id
 * Delete a card tag
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = await prisma.cardTag.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Card tag not found" },
        { status: 404 }
      );
    }

    await prisma.cardTag.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Card tag "${existing.name}" deleted`,
    });
  } catch (error) {
    console.error("Error deleting card tag:", error);
    return NextResponse.json(
      { error: "Failed to delete card tag" },
      { status: 500 }
    );
  }
}
