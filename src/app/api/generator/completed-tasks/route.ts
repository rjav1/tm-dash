import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * GET /api/generator/completed-tasks
 * Get failed tasks and successful but not-imported tasks
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);

    // Get failed tasks and successful-but-not-imported tasks
    const [failedTasks, unimportedTasks, stats] = await Promise.all([
      prisma.generatorTask.findMany({
        where: { status: "FAILED" },
        orderBy: { completedAt: "desc" },
        take: limit,
        select: {
          id: true,
          email: true,
          status: true,
          errorMessage: true,
          lastError: true,
          retryCount: true,
          completedAt: true,
          job: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.generatorTask.findMany({
        where: {
          status: "SUCCESS",
          imported: false,
        },
        orderBy: { completedAt: "desc" },
        take: limit,
        select: {
          id: true,
          email: true,
          status: true,
          password: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
          imported: true,
          completedAt: true,
          job: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      // Get counts
      Promise.all([
        prisma.generatorTask.count({ where: { status: "FAILED" } }),
        prisma.generatorTask.count({ where: { status: "SUCCESS", imported: false } }),
        prisma.generatorTask.count({ where: { status: "SUCCESS", imported: true } }),
      ]),
    ]);

    return NextResponse.json({
      failed: failedTasks,
      unimported: unimportedTasks,
      stats: {
        failed: stats[0],
        unimported: stats[1],
        imported: stats[2],
      },
    });
  } catch (error) {
    console.error("Error fetching completed tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch completed tasks" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generator/completed-tasks
 * Import selected tasks to accounts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds, tagId } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "Task IDs are required" },
        { status: 400 }
      );
    }

    // Get the tasks to import
    const tasks = await prisma.generatorTask.findMany({
      where: {
        id: { in: taskIds },
        status: "SUCCESS",
        imported: false,
      },
    });

    if (tasks.length === 0) {
      return NextResponse.json(
        { error: "No valid tasks to import" },
        { status: 400 }
      );
    }

    // Import each task as an account
    let imported = 0;
    let skipped = 0;

    for (const task of tasks) {
      try {
        // Check if account already exists
        const existing = await prisma.account.findUnique({
          where: { email: task.email },
        });

        if (existing) {
          skipped++;
          // Still mark as imported
          await prisma.generatorTask.update({
            where: { id: task.id },
            data: { imported: true, importedAt: new Date() },
          });
          continue;
        }

        // Create account
        await prisma.account.create({
          data: {
            email: task.email,
            password: task.password || "",
            phone: task.phoneNumber,
            firstName: task.firstName,
            lastName: task.lastName,
            zipCode: task.postalCode,
            status: "ACTIVE",
            tagId: tagId || null,
            generatorJobId: task.jobId,
          },
        });

        // Mark task as imported
        await prisma.generatorTask.update({
          where: { id: task.id },
          data: { imported: true, importedAt: new Date() },
        });

        imported++;
      } catch (err) {
        console.error(`Failed to import task ${task.id}:`, err);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      message: `Imported ${imported} accounts${skipped > 0 ? `, ${skipped} skipped` : ""}`,
    });
  } catch (error) {
    console.error("Error importing tasks:", error);
    return NextResponse.json(
      { error: "Failed to import tasks" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/generator/completed-tasks
 * Clear failed tasks or mark them for retry
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds, clearAll, action } = body;

    if (clearAll && action === "clear_failed") {
      // Delete all failed tasks
      const result = await prisma.generatorTask.deleteMany({
        where: { status: "FAILED" },
      });

      return NextResponse.json({
        success: true,
        deleted: result.count,
        message: `Cleared ${result.count} failed tasks`,
      });
    }

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "Task IDs are required" },
        { status: 400 }
      );
    }

    const result = await prisma.generatorTask.deleteMany({
      where: { id: { in: taskIds } },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} tasks`,
    });
  } catch (error) {
    console.error("Error deleting tasks:", error);
    return NextResponse.json(
      { error: "Failed to delete tasks" },
      { status: 500 }
    );
  }
}
