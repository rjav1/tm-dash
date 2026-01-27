/**
 * Tag Assignment API Route
 * 
 * POST /api/tags/assign - Assign or remove tags from entities
 * 
 * Body: {
 *   type: "account" | "card" | "queue",
 *   entityIds: string[],
 *   tagIds: string[],
 *   action: "add" | "remove" | "set"  // set replaces all tags
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

type TagType = "account" | "card" | "queue";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, entityIds, tagIds, action = "add" } = body as {
      type: TagType;
      entityIds: string[];
      tagIds: string[];
      action?: "add" | "remove" | "set";
    };

    if (!type || !["account", "card", "queue"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing tag type" },
        { status: 400 }
      );
    }

    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Entity IDs are required" },
        { status: 400 }
      );
    }

    if (!tagIds || !Array.isArray(tagIds)) {
      return NextResponse.json(
        { success: false, error: "Tag IDs are required" },
        { status: 400 }
      );
    }

    let updated = 0;

    // Process each entity
    for (const entityId of entityIds) {
      try {
        if (type === "account") {
          if (action === "set") {
            await prisma.account.update({
              where: { id: entityId },
              data: {
                tags: {
                  set: tagIds.map(id => ({ id })),
                },
              },
            });
          } else if (action === "add") {
            await prisma.account.update({
              where: { id: entityId },
              data: {
                tags: {
                  connect: tagIds.map(id => ({ id })),
                },
              },
            });
          } else if (action === "remove") {
            await prisma.account.update({
              where: { id: entityId },
              data: {
                tags: {
                  disconnect: tagIds.map(id => ({ id })),
                },
              },
            });
          }
        } else if (type === "card") {
          if (action === "set") {
            await prisma.card.update({
              where: { id: entityId },
              data: {
                tags: {
                  set: tagIds.map(id => ({ id })),
                },
              },
            });
          } else if (action === "add") {
            await prisma.card.update({
              where: { id: entityId },
              data: {
                tags: {
                  connect: tagIds.map(id => ({ id })),
                },
              },
            });
          } else if (action === "remove") {
            await prisma.card.update({
              where: { id: entityId },
              data: {
                tags: {
                  disconnect: tagIds.map(id => ({ id })),
                },
              },
            });
          }
        } else if (type === "queue") {
          if (action === "set") {
            await prisma.checkoutJob.update({
              where: { id: entityId },
              data: {
                tags: {
                  set: tagIds.map(id => ({ id })),
                },
              },
            });
          } else if (action === "add") {
            await prisma.checkoutJob.update({
              where: { id: entityId },
              data: {
                tags: {
                  connect: tagIds.map(id => ({ id })),
                },
              },
            });
          } else if (action === "remove") {
            await prisma.checkoutJob.update({
              where: { id: entityId },
              data: {
                tags: {
                  disconnect: tagIds.map(id => ({ id })),
                },
              },
            });
          }
        }
        updated++;
      } catch (e) {
        console.error(`[Tag Assign] Failed to update entity ${entityId}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      message: `${action === "set" ? "Set" : action === "add" ? "Added" : "Removed"} tags for ${updated} ${type}(s)`,
    });
  } catch (error) {
    console.error("[Tag Assign API] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to assign tags" },
      { status: 500 }
    );
  }
}
