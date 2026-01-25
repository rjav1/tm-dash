import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/generator/jobs/[id]/import
 * Import successful tasks as accounts
 * 
 * Body:
 * - taskIds: string[] (specific tasks to import)
 * - all: boolean (import all successful, non-imported tasks)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: jobId } = await params;
    const body = await request.json();
    const { taskIds, all } = body;

    // Get the job with tag info
    const job = await prisma.generatorJob.findUnique({
      where: { id: jobId },
      include: { tag: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Build query for tasks to import
    let tasksToImport;
    if (all) {
      tasksToImport = await prisma.generatorTask.findMany({
        where: {
          jobId,
          status: "SUCCESS",
          imported: false,
        },
      });
    } else if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
      tasksToImport = await prisma.generatorTask.findMany({
        where: {
          id: { in: taskIds },
          jobId,
          status: "SUCCESS",
          imported: false,
        },
      });
    } else {
      return NextResponse.json(
        { error: "Task IDs or 'all' flag is required" },
        { status: 400 }
      );
    }

    if (tasksToImport.length === 0) {
      return NextResponse.json({
        success: true,
        imported: 0,
        message: "No tasks to import",
      });
    }

    // Import accounts and mark tasks as imported
    let importedCount = 0;
    const errors: string[] = [];

    for (const task of tasksToImport) {
      try {
        // Check if account already exists
        const existingAccount = await prisma.account.findUnique({
          where: { email: task.email },
        });

        if (existingAccount) {
          // Update existing account with new password if it exists
          if (task.password) {
            await prisma.account.update({
              where: { email: task.email },
              data: {
                password: task.password,
                phoneNumber: task.phoneNumber,
                generatedAt: new Date(),
                generatorJobId: jobId,
                generatorTaskId: task.id,
              },
            });
          }
        } else {
          // Create new account
          const newAccount = await prisma.account.create({
            data: {
              email: task.email,
              password: task.password,
              phoneNumber: task.phoneNumber,
              imapProvider: task.imapSource,
              status: "ACTIVE",
              generatedAt: new Date(),
              generatorJobId: jobId,
              generatorTaskId: task.id,
            },
          });

          // Link tag if job has one
          if (job.tagId) {
            await prisma.account.update({
              where: { id: newAccount.id },
              data: {
                tags: {
                  connect: { id: job.tagId },
                },
              },
            });
          }
        }

        // Mark task as imported
        await prisma.generatorTask.update({
          where: { id: task.id },
          data: {
            imported: true,
            importedAt: new Date(),
          },
        });

        importedCount++;
      } catch (error) {
        errors.push(`Failed to import ${task.email}: ${error}`);
      }
    }

    // Delete emails from the pool (they're now accounts)
    const importedEmails = tasksToImport.map((t) => t.email.toLowerCase());
    await prisma.generatorEmail.deleteMany({
      where: { email: { in: importedEmails } },
    });

    return NextResponse.json({
      success: true,
      imported: importedCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Imported ${importedCount} accounts`,
    });
  } catch (error) {
    console.error("Error importing tasks:", error);
    return NextResponse.json(
      { error: "Failed to import tasks" },
      { status: 500 }
    );
  }
}
