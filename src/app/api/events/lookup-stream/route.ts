import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { ScrapeJobStatus, ScrapeJobType } from "@prisma/client";
import { convertEventDateToVenueTimezone } from "@/lib/timezone-utils";

// Constants
const SCRAPE_TIMEOUT_MS = 60000; // 60 seconds max (increased for proxy retries)
const POLL_INTERVAL_MS = 200; // Poll every 200ms for responsiveness
const JOB_PICKUP_TIMEOUT_MS = 10000; // 10 seconds to wait for daemon to claim job

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
 * 
 * Robust version with:
 * - Job creation verification
 * - Stuck job detection
 * - Better timeout handling
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { eventId, artistName, venue, date, includeVividSeats = true } = body;

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: ProgressUpdate) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may be closed
        }
      };

      const closeStream = () => {
        try {
          controller.close();
        } catch {
          // Already closed
        }
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
              closeStream();
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
              closeStream();
              return;
            }
          }

          // No data found
          sendEvent({
            type: "error",
            error: "VPS scraper is offline and no cached data found. Please start the scraper on your VPS or enter details manually.",
          });
          closeStream();
          return;
        }

        // Scraper is online - create scrape jobs
        console.log(`[Lookup Stream] Scraper online (${scraperRun.workerId}), creating job...`);
        
        let tmJobId: string | null = null;
        let vsJobId: string | null = null;

        // Step 1: Create Ticketmaster scrape job
        if (eventId) {
          sendEvent({ type: "progress", step: "tm_queued", percent: 10, message: "Creating scrape job..." });
          
          try {
            const tmJob = await prisma.scrapeJob.create({
              data: {
                type: ScrapeJobType.TICKETMASTER_EVENT,
                status: ScrapeJobStatus.QUEUED,
                inputData: JSON.stringify({ eventId }),
                progress: JSON.stringify({ step: "queued", percent: 0, message: "Waiting for scraper..." }),
              },
            });
            tmJobId = tmJob.id;
            console.log(`[Lookup Stream] Created TM job: ${tmJobId}`);
            
            // Verify job was created
            const verifyJob = await prisma.scrapeJob.findUnique({
              where: { id: tmJobId },
            });
            
            if (!verifyJob) {
              throw new Error("Job creation failed - could not verify");
            }
            
            console.log(`[Lookup Stream] Job verified: ${verifyJob.id}, status: ${verifyJob.status}`);
            sendEvent({ type: "progress", step: "tm_waiting", percent: 12, message: "Job queued, waiting for scraper..." });
            
          } catch (createError) {
            console.error("[Lookup Stream] Failed to create job:", createError);
            sendEvent({
              type: "error",
              error: `Failed to create scrape job: ${createError instanceof Error ? createError.message : "Unknown error"}`,
            });
            closeStream();
            return;
          }
        }

        // Poll for TM job completion
        let tmResult: { success: boolean; data: Record<string, unknown> | null } = { success: false, data: null };
        let scrapedData: Record<string, unknown> | null = null;
        
        if (tmJobId) {
          const startTime = Date.now();
          let lastProgress = "";
          let jobPickedUp = false;
          
          while (Date.now() - startTime < SCRAPE_TIMEOUT_MS) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            
            const job = await prisma.scrapeJob.findUnique({
              where: { id: tmJobId },
            });

            if (!job) {
              console.log(`[Lookup Stream] Job ${tmJobId} disappeared from database`);
              sendEvent({ type: "error", error: "Job disappeared from database" });
              closeStream();
              return;
            }

            // Check if job was picked up (status changed from QUEUED)
            if (job.status !== "QUEUED" && !jobPickedUp) {
              jobPickedUp = true;
              console.log(`[Lookup Stream] Job ${tmJobId} picked up by worker, status: ${job.status}`);
            }

            // Check if job is stuck in QUEUED state
            if (!jobPickedUp && Date.now() - startTime > JOB_PICKUP_TIMEOUT_MS) {
              console.log(`[Lookup Stream] Job ${tmJobId} not picked up after ${JOB_PICKUP_TIMEOUT_MS}ms`);
              
              // Check if scraper is still online
              const stillOnline = await prisma.scrapeRun.findFirst({
                where: {
                  status: "RUNNING",
                  lastHeartbeat: { gte: new Date(Date.now() - 15000) },
                },
              });
              
              if (!stillOnline) {
                // Scraper went offline, clean up job
                await prisma.scrapeJob.update({
                  where: { id: tmJobId },
                  data: {
                    status: ScrapeJobStatus.FAILED,
                    errorCode: "SCRAPER_OFFLINE",
                    errorMessage: "Scraper went offline while job was queued",
                    completedAt: new Date(),
                  },
                });
                
                sendEvent({
                  type: "error",
                  error: "Scraper went offline. Please check if scrape_daemon.py is running on your VPS.",
                });
                closeStream();
                return;
              }
              
              // Scraper online but not picking up - send warning but keep waiting
              sendEvent({ 
                type: "progress", 
                step: "tm_waiting", 
                percent: 15, 
                message: "Waiting for scraper to pick up job..." 
              });
            }

            // Send progress updates from the daemon
            if (job.progress && job.progress !== lastProgress) {
              lastProgress = job.progress;
              try {
                const progress = JSON.parse(job.progress);
                // Scale TM progress to 15-60% range
                const scaledPercent = 15 + (progress.percent || 0) * 0.45;
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
              
              // Convert date/time to venue's local timezone if we have venue state info
              if (scrapedData) {
                const data = scrapedData as Record<string, unknown>;
                const venueState = data.venueState as string | null;
                const rawStartDate = data.rawStartDate as string | null; // UTC ISO date from TM
                
                if (rawStartDate && venueState) {
                  // Convert UTC date to venue's local timezone
                  const converted = convertEventDateToVenueTimezone(rawStartDate, venueState);
                  console.log(`[Lookup Stream] Converting date from UTC ${rawStartDate} to ${venueState}: ${converted.date} at ${converted.time}`);
                  data.date = converted.date;
                  data.time = converted.time;
                  data.dayOfWeek = converted.dayOfWeek;
                } else if (data.date && typeof data.date === "string" && data.date.includes("T") && venueState) {
                  // If date looks like an ISO string, convert it
                  const converted = convertEventDateToVenueTimezone(data.date as string, venueState);
                  console.log(`[Lookup Stream] Converting ISO date ${data.date} to ${venueState}: ${converted.date} at ${converted.time}`);
                  data.date = converted.date;
                  data.time = converted.time;
                  data.dayOfWeek = converted.dayOfWeek;
                }
              }
              
              sendEvent({ type: "progress", step: "tm_complete", percent: 60, message: "Ticketmaster data retrieved!" });
              console.log(`[Lookup Stream] TM job ${tmJobId} succeeded`);
              break;
            }

            if (job.status === "FAILED") {
              const errorMsg = job.errorMessage || "Unknown error";
              console.log(`[Lookup Stream] TM job ${tmJobId} failed: ${errorMsg}`);
              sendEvent({ 
                type: "progress", 
                step: "tm_failed", 
                percent: 50, 
                message: `Scrape failed: ${errorMsg.substring(0, 50)}${errorMsg.length > 50 ? "..." : ""}` 
              });
              break;
            }
          }
          
          // Check for timeout
          if (!scrapedData && Date.now() - startTime >= SCRAPE_TIMEOUT_MS) {
            console.log(`[Lookup Stream] TM job ${tmJobId} timed out`);
            
            // Mark job as failed
            await prisma.scrapeJob.update({
              where: { id: tmJobId },
              data: {
                status: ScrapeJobStatus.FAILED,
                errorCode: "TIMEOUT",
                errorMessage: "Job timed out waiting for completion",
                completedAt: new Date(),
              },
            }).catch(() => {});
            
            sendEvent({ type: "progress", step: "tm_timeout", percent: 50, message: "Request timed out" });
          }
        }

        // Step 2: Create Vivid Seats scrape job if requested and we have enough data
        if (includeVividSeats && scrapedData) {
          const vsArtist = (scrapedData as Record<string, unknown>).artistName as string || artistName;
          const vsVenue = (scrapedData as Record<string, unknown>).venue as string || venue;
          const vsDate = (scrapedData as Record<string, unknown>).date as string || date;
          
          if (vsArtist && vsVenue) {
            sendEvent({ type: "progress", step: "vs_queued", percent: 65, message: "Queuing Vivid Seats price lookup..." });
            
            try {
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
              console.log(`[Lookup Stream] Created VS job: ${vsJobId}`);

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
                  closeStream();
                  return;
                }

                if (job.status === "FAILED") {
                  sendEvent({ type: "progress", step: "vs_failed", percent: 90, message: "VS lookup failed, using TM data only" });
                  break;
                }
              }
            } catch (vsError) {
              console.error("[Lookup Stream] VS job error:", vsError);
              sendEvent({ type: "progress", step: "vs_error", percent: 90, message: "VS lookup error, using TM data only" });
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
            error: "Could not retrieve event information. The scraper may have failed or timed out. Check VPS logs for details.",
          });
        }

        closeStream();
      } catch (error) {
        console.error("[Lookup Stream] Error:", error);
        sendEvent({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
        closeStream();
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
