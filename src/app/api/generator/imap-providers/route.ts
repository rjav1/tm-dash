import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/imap-providers
 * List all IMAP providers
 */
export async function GET() {
  try {
    const providers = await prisma.imapProvider.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        isEnabled: p.isEnabled,
        config: JSON.parse(p.config || "{}"),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching IMAP providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch IMAP providers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generator/imap-providers
 * Create a new IMAP provider
 * 
 * Body:
 * - name: string (unique identifier, e.g., "aycd", "gmail")
 * - displayName: string (human readable name)
 * - isEnabled: boolean (default: true)
 * - config: object (provider-specific configuration)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, displayName, isEnabled = true, config = {} } = body;

    if (!name || !displayName) {
      return NextResponse.json(
        { error: "name and displayName are required" },
        { status: 400 }
      );
    }

    // Check if provider with same name exists
    const existing = await prisma.imapProvider.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Provider with name '${name}' already exists` },
        { status: 409 }
      );
    }

    const provider = await prisma.imapProvider.create({
      data: {
        name,
        displayName,
        isEnabled,
        config: JSON.stringify(config),
      },
    });

    return NextResponse.json({
      success: true,
      provider: {
        id: provider.id,
        name: provider.name,
        displayName: provider.displayName,
        isEnabled: provider.isEnabled,
        config: JSON.parse(provider.config || "{}"),
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating IMAP provider:", error);
    return NextResponse.json(
      { error: "Failed to create IMAP provider" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/generator/imap-providers
 * Update an existing IMAP provider
 * 
 * Body:
 * - id: string (required)
 * - name: string (optional)
 * - displayName: string (optional)
 * - isEnabled: boolean (optional)
 * - config: object (optional)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, displayName, isEnabled, config } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.imapProvider.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // If changing name, check for uniqueness
    if (name && name !== existing.name) {
      const nameConflict = await prisma.imapProvider.findUnique({
        where: { name },
      });
      if (nameConflict) {
        return NextResponse.json(
          { error: `Provider with name '${name}' already exists` },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (config !== undefined) updateData.config = JSON.stringify(config);

    const provider = await prisma.imapProvider.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      provider: {
        id: provider.id,
        name: provider.name,
        displayName: provider.displayName,
        isEnabled: provider.isEnabled,
        config: JSON.parse(provider.config || "{}"),
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating IMAP provider:", error);
    return NextResponse.json(
      { error: "Failed to update IMAP provider" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/generator/imap-providers
 * Delete an IMAP provider
 * 
 * Body or Query:
 * - id: string (required)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");

    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.imapProvider.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    await prisma.imapProvider.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Provider '${existing.name}' deleted`,
      id,
    });
  } catch (error) {
    console.error("Error deleting IMAP provider:", error);
    return NextResponse.json(
      { error: "Failed to delete IMAP provider" },
      { status: 500 }
    );
  }
}
