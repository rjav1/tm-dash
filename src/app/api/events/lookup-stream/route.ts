import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { ScrapeJobStatus, ScrapeJobType } from "@prisma/client";

// Constants
const SCRAPE_TIMEOUT_MS = 45000; // 45 seconds max
const POLL_INTERVAL_MS = 300; // Poll every 300ms for responsiveness

interface ProgressUpdate {
  type: "progress" | "complete" | "error";
  step?: string;
  percent?: number;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * POST /api/events/lookup-stream
 * 
 * Stream-based event lookup with live progress updates.
 * Uses Server-Sent Events (SSE) to push progress to the client.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { eventId, artistName, venue, date, includeVividSeats = true } = body;

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: ProgressUpdate) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Check if VPS scraper is online
        sendEvent({ type: "progress", step: "checking", percent: 5, message: "Checking scraper status..." });
        
        const thirtySecondsAgo = new Date(Date.now() - 30000);
        const scraperRun = await prisma.scrapeRun.findFirst({
          where: {
            status: "RUNNING",
            lastHeartbeat: { gte: thirtySecondsAgo },
          },
        });

        if (!scraperRun) {
          // Scraper offline - try database fallback
          sendEvent({ type: "progress", step: "database", percent: 10, message: "Scraper offline, checking database..." });
          
          // Try to find event in database
          if (eventId) {
            const existingEvent = await prisma.event.findFirst({
              where: { tmEventId: eventId },
            });

            if (existingEvent && existingEvent.eventName) {
              sendEvent({ type: "progress", step: "found", percent: 100, message: "Found event in database!" });
              sendEvent({
                type: "complete",
                data: {
                  success: true,
                  source: "database",
                  scraped: {
                    eventName: existingEvent.eventName,
                    artistName: existingEvent.artistName,
                    venue: existingEvent.venue,
                    date: existingEvent.eventDate,
                    dayOfWeek: existingEvent.dayOfWeek,
                  },
                },
              });
              controller.close();
              return;
            }
          }

          // Check checkout jobs for event info
          sendEvent({ type: "progress", step: "checkout", percent: 20, message: "Checking checkout history..." });
          
          if (eventId) {
            const checkoutJob = await prisma.checkoutJob.findFirst({
              where: { tmEventId: eventId, eventName: { not: null } },
              orderBy: { createdAt: "desc" },
            });

            if (checkoutJob?.eventName) {
              sendEvent({ type: "progress", step: "found", percent: 100, message: "Found event in checkout history!" });
              sendEvent({
                type: "complete",
                data: {
                  success: true,
                  source: "database",
                  scraped: {
                    eventName: checkoutJob.eventName,
                    venue: checkoutJob.venue,
                    date: checkoutJob.eventDate,
                  },
                },
              });
              controller.close();
              return;
            }
          }

          // No data found
          sendEvent({
            type: "error",
            error: "VPS scraper is offline and no cached data found. Please start the scraper on your VPS or enter details manually.",
          });
          controller.close();
          return;
        }

        // Scraper is online - create scrape jobs
        let tmJobId: string | null = null;
        let vsJobId: string | null = null;
        const totalSteps = includeVividSeats ? 2 : 1;
        let completedSteps = 0;

        // Step 1: Create Ticketmaster scrape job
        if (eventId) {
          sendEvent({ type: "progress", step: "tm_queued", percent: 10, message: "Queuing Ticketmaster scrape..." });
          
          const tmJob = await prisma.scrapeJob.create({
            data: {
              type: ScrapeJobType.TICKETMASTER_EVENT,
              status: ScrapeJobStatus.QUEUED,
              inputData: JSON.stringify({ eventId }),
              progress: JSON.stringify({ step: "queued", percent: 0, message: "Waiting for scraper..." }),
            },
          });
          tmJobId = tmJob.id;
          console.log(`[Lookup Stream] Created TM scrape job: ${tmJobId}`);
        }

        // Poll for TM job completion
        let tmResult: { success: boolean; data: Record<string, unknown> | null } = { success: false, data: null };
        let scrapedData: Record<string, unknown> | null = null;
        
        if (tmJobId) {
          const startTime = Date.now();
          let lastProgress = "";
          
          while (Date.now() - startTime < SCRAPE_TIMEOUT_MS) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            
            const job = await prisma.scrapeJob.findUnique({
              where: { id: tmJobId },
            });

            if (!job) break;

            // Send progress updates from the daemon
            if (job.progress && job.progress !== lastProgress) {
              lastProgress = job.progress;
              try {
                const progress = JSON.parse(job.progress);
                // Scale TM progress to 10-60% range
                const scaledPercent = 10 + (progress.percent || 0) * 0.5;
                sendEvent({
                  type: "progress",
                  step: `tm_${progress.step}`,
                  percent: Math.round(scaledPercent),
                  message: progress.message || "Scraping Ticketmaster...",
                });
              } catch {
                // Ignore parse errors
              }
            }

            if (job.status === "SUCCESS") {
              tmResult = {
                success: true,
                data: job.outputData ? JSON.parse(job.outputData) : null,
              };
              scrapedData = tmResult.data;
              completedSteps++;
              sendEvent({ type: "progress", step: "tm_complete", percent: 60, message: "Ticketmaster data retrieved!" });
              break;
            }

            if (job.status === "FAILED") {
              sendEvent({ type: "progress", step: "tm_failed", percent: 50, message: job.errorMessage || "TM scrape failed, continuing..." });
              break;
            }
          }
        }

        // Step 2: Create Vivid Seats scrape job if requested and we have enough data
        if (includeVividSeats && scrapedData) {
          const vsArtist = (scrapedData as Record<string, unknown>).artistName as string || artistName;
          const vsVenue = (scrapedData as Record<string, unknown>).venue as string || venue;
          const vsDate = (scrapedData as Record<string, unknown>).date as string || date;
          
          if (vsArtist && vsVenue) {
            sendEvent({ type: "progress", step: "vs_queued", percent: 65, message: "Queuing Vivid Seats price lookup..." });
            
            const vsJob = await prisma.scrapeJob.create({
              data: {
                type: ScrapeJobType.VIVID_SEATS_PRICE,
                status: ScrapeJobStatus.QUEUED,
                inputData: JSON.stringify({
                  artistName: vsArtist,
                  venue: vsVenue,
                  date: vsDate,
                }),
                progress: JSON.stringify({ step: "queued", percent: 0, message: "Waiting for scraper..." }),
              },
            });
            vsJobId = vsJob.id;
            console.log(`[Lookup Stream] Created VS scrape job: ${vsJobId}`);

            // Poll for VS job completion
            const startTime = Date.now();
            let lastProgress = "";

            while (Date.now() - startTime < SCRAPE_TIMEOUT_MS) {
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
              
              const job = await prisma.scrapeJob.findUnique({
                where: { id: vsJobId },
              });

              if (!job) break;

              // Send progress updates from the daemon
              if (job.progress && job.progress !== lastProgress) {
                lastProgress = job.progress;
                try {
                  const progress = JSON.parse(job.progress);
                  // Scale VS progress to 65-95% range
                  const scaledPercent = 65 + (progress.percent || 0) * 0.3;
                  sendEvent({
                    type: "progress",
                    step: `vs_${progress.step}`,
                    percent: Math.round(scaledPercent),
                    message: progress.message || "Fetching Vivid Seats prices...",
                  });
                } catch {
                  // Ignore parse errors
                }
              }

              if (job.status === "SUCCESS") {
                const vsData = job.outputData ? JSON.parse(job.outputData) : null;
                completedSteps++;
                sendEvent({ type: "progress", step: "vs_complete", percent: 95, message: "Vivid Seats prices retrieved!" });
                
                // Send complete with all data
                sendEvent({
                  type: "complete",
                  data: {
                    success: true,
                    source: "vps",
                    scraped: scrapedData,
                    vividSeats: vsData,
                  },
                });
                controller.close();
                return;
              }

              if (job.status === "FAILED") {
                sendEvent({ type: "progress", step: "vs_failed", percent: 90, message: "VS lookup failed, using TM data only" });
                break;
              }
            }
          }
        }

        // Send final result with whatever we have
        sendEvent({ type: "progress", step: "finalizing", percent: 100, message: "Complete!" });
        
        if (scrapedData) {
          sendEvent({
            type: "complete",
            data: {
              success: true,
              source: "vps",
              scraped: scrapedData,
              vividSeats: null,
            },
          });
        } else {
          sendEvent({
            type: "error",
            error: "Could not retrieve event information. Please try again or enter details manually.",
          });
        }

        controller.close();
      } catch (error) {
        console.error("[Lookup Stream] Error:", error);
        sendEvent({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
