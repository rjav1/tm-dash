/**
 * Ticketmaster Event Page Scraper
 * 
 * Scrapes event details directly from ticketmaster.com/event/{eventId}
 * when only an event ID is available (no artist name for API search)
 * 
 * Note: Dates are automatically converted to the venue's local timezone
 * based on the venue's state/province code.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { convertEventDateToVenueTimezone, normalizeTimezone } from "@/lib/timezone-utils";

export interface ScrapedEventData {
  eventName: string | null;
  artistName: string | null;
  venue: string | null;
  venueCity: string | null;
  venueState: string | null;
  date: string | null;
  time: string | null;
  dayOfWeek: string | null;
  url: string;
  scrapedAt: string;
  error?: string;
}

// Reuse browser instance for efficiency
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });
  }
  return browserInstance;
}

/**
 * Close the Ticketmaster scraper browser instance (call on app shutdown)
 */
export async function closeTicketmasterBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Scrape event details from Ticketmaster event page
 */
export async function scrapeEventPage(eventId: string): Promise<ScrapedEventData> {
  // Try different TM domains (US and Canada)
  const urls = [
    `https://www.ticketmaster.com/event/${eventId}`,
    `https://www.ticketmaster.ca/event/${eventId}`,
  ];

  let lastError: string | null = null;
  
  for (const url of urls) {
    const result = await tryScrapePage(url, eventId);
    if (result.eventName) {
      return result;
    }
    lastError = result.error || "No event data found";
  }

  return {
    eventName: null,
    artistName: null,
    venue: null,
    venueCity: null,
    venueState: null,
    date: null,
    time: null,
    dayOfWeek: null,
    url: urls[0],
    scrapedAt: new Date().toISOString(),
    error: lastError || "Could not find event on Ticketmaster",
  };
}

async function tryScrapePage(url: string, eventId: string): Promise<ScrapedEventData> {
  let page: Page | null = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log(`[TM Scraper] Navigating to: ${url}`);
    
    // Navigate to the page
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Check if page loaded successfully
    if (!response || response.status() === 404) {
      return {
        eventName: null,
        artistName: null,
        venue: null,
        venueCity: null,
        venueState: null,
        date: null,
        time: null,
        dayOfWeek: null,
        url,
        scrapedAt: new Date().toISOString(),
        error: "Event page not found (404)",
      };
    }

    // Wait for content to load
    await page.waitForSelector("h1", { timeout: 10000 }).catch(() => null);
    
    // Give React time to hydrate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract event data from the page
    const eventData = await page.evaluate(() => {
      // Helper to clean text
      const cleanText = (text: string | null | undefined): string | null => {
        if (!text) return null;
        return text.trim().replace(/\s+/g, " ");
      };

      // Get page title - often contains reliable structured info
      // e.g., "BTS WORLD TOUR 'ARIRANG' IN STANFORD Tickets 2026-05-16 Stanford, CA | Ticketmaster"
      const pageTitle = document.title || "";

      // Try to find the event name (h1 tag)
      let eventName: string | null = null;
      const h1Elements = document.querySelectorAll("h1");
      for (const h1 of h1Elements) {
        const text = cleanText(h1.textContent);
        if (text && text.length > 3 && !text.toLowerCase().includes("ticketmaster")) {
          eventName = text;
          break;
        }
      }

      // Try to find artist name from breadcrumb navigation
      let artistName: string | null = null;
      const breadcrumbNav = document.querySelector('nav[aria-label*="breadcrumb"], nav[aria-label*="Breadcrumb"]');
      if (breadcrumbNav) {
        const breadcrumbLinks = breadcrumbNav.querySelectorAll("a");
        if (breadcrumbLinks.length > 0) {
          const lastLink = breadcrumbLinks[breadcrumbLinks.length - 1];
          const text = cleanText(lastLink.textContent);
          if (text && text.length > 2 && !text.toLowerCase().includes("home") && !text.toLowerCase().includes("ticket")) {
            artistName = text;
          }
        }
      }
      
      // Also try artist links
      if (!artistName) {
        const allLinks = document.querySelectorAll('a[href*="/artist/"], a[href*="browse/"]');
        for (const link of allLinks) {
          const text = cleanText(link.textContent);
          if (text && text.length > 2 && 
              !text.toLowerCase().includes("home") && 
              !text.toLowerCase().includes("tickets") &&
              !text.toLowerCase().includes("concert")) {
            artistName = text;
            break;
          }
        }
      }

      // Try to find date/time info from multiple sources
      // Queue pages use h4 elements: "Sat • May 16 • 7:00 PM"
      // Regular pages may use spans
      let dateTimeText: string | null = null;
      
      // Check headings first (h2, h3, h4) - queue pages put date here
      const headingElements = document.querySelectorAll("h2, h3, h4");
      for (const heading of headingElements) {
        const text = cleanText(heading.textContent);
        // Pattern: "Day • Month Day • Time" e.g., "Sat • May 16 • 7:00 PM"
        if (text && /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b\s*[•·]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{1,2}/i.test(text)) {
          dateTimeText = text;
          break;
        }
      }
      
      // Fall back to spans
      if (!dateTimeText) {
        const spanElements = document.querySelectorAll("span");
        for (const span of spanElements) {
          const text = cleanText(span.textContent);
          if (text && /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(text)) {
            dateTimeText = text;
            break;
          }
        }
      }

      // Try to find venue info
      // Queue pages use h4: "Stanford Stadium • Stanford, CA"
      let venueText: string | null = null;
      
      // Check headings for venue pattern: "Venue Name • City, ST"
      for (const heading of headingElements) {
        const text = cleanText(heading.textContent);
        // Pattern: contains bullet separator and ends with state abbreviation
        if (text && /[•·]/.test(text) && /,\s*[A-Z]{2}\s*$/.test(text)) {
          // Skip if this is the date/time heading
          if (!/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(text)) {
            venueText = text;
            break;
          }
        }
      }
      
      // Try venue links
      if (!venueText) {
        const venueLinks = document.querySelectorAll('a[href*="/venue/"]');
        for (const link of venueLinks) {
          const text = cleanText(link.textContent);
          if (text && text.length > 3) {
            venueText = text;
            break;
          }
        }
      }

      // Fall back to elements with city, state pattern
      if (!venueText) {
        const allElements = document.querySelectorAll("span, div, p");
        for (const el of allElements) {
          const text = cleanText(el.textContent);
          if (text && text.includes(",") && /[A-Z]{2}\s*$/.test(text) && text.length < 100) {
            venueText = text;
            break;
          }
        }
      }

      // Try to get structured data from JSON-LD
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      let structuredData: any = null;
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent || "");
          if (data["@type"] === "Event" || data["@type"] === "MusicEvent") {
            structuredData = data;
            break;
          }
          if (Array.isArray(data)) {
            const eventItem = data.find((item: any) => item["@type"] === "Event" || item["@type"] === "MusicEvent");
            if (eventItem) {
              structuredData = eventItem;
              break;
            }
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      }

      return {
        eventName,
        artistName,
        dateTimeText,
        venueText,
        structuredData,
        pageTitle,
      };
    });

    console.log("[TM Scraper] Extracted data:", JSON.stringify(eventData, null, 2));

    // Parse the extracted data
    let parsedData: ScrapedEventData = {
      eventName: null,
      artistName: null,
      venue: null,
      venueCity: null,
      venueState: null,
      date: null,
      time: null,
      dayOfWeek: null,
      url,
      scrapedAt: new Date().toISOString(),
    };

    // Use structured data if available (most reliable)
    if (eventData.structuredData) {
      const sd = eventData.structuredData;
      parsedData.eventName = sd.name || null;
      
      // Get performer/artist name
      if (sd.performer) {
        if (Array.isArray(sd.performer)) {
          parsedData.artistName = sd.performer[0]?.name || null;
        } else {
          parsedData.artistName = sd.performer.name || null;
        }
      }
      
      // Get venue FIRST (needed for timezone conversion)
      if (sd.location) {
        parsedData.venue = sd.location.name || null;
        if (sd.location.address) {
          parsedData.venueCity = sd.location.address.addressLocality || null;
          parsedData.venueState = sd.location.address.addressRegion || null;
        }
      }
      
      // Get date/time - convert to venue's local timezone
      if (sd.startDate) {
        try {
          // Check if Ticketmaster provided a timezone in the event data
          const tmTimezone = normalizeTimezone(sd.timezone || sd.dates?.timezone);
          
          if (tmTimezone) {
            // Use the timezone from Ticketmaster API directly
            const dateObj = new Date(sd.startDate);
            const dateFormatter = new Intl.DateTimeFormat("en-US", {
              timeZone: tmTimezone,
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            const timeFormatter = new Intl.DateTimeFormat("en-US", {
              timeZone: tmTimezone,
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const dayFormatter = new Intl.DateTimeFormat("en-US", {
              timeZone: tmTimezone,
              weekday: "short",
            });
            
            parsedData.date = dateFormatter.format(dateObj);
            parsedData.time = timeFormatter.format(dateObj);
            parsedData.dayOfWeek = dayFormatter.format(dateObj);
            
            console.log(`[TM Scraper] Converted date using TM timezone (${tmTimezone}): ${parsedData.date} at ${parsedData.time}`);
          } else {
            // Fall back to inferring timezone from venue state
            const converted = convertEventDateToVenueTimezone(sd.startDate, parsedData.venueState);
            parsedData.date = converted.date;
            parsedData.time = converted.time;
            parsedData.dayOfWeek = converted.dayOfWeek;
          }
        } catch (e) {
          // Date parsing failed - fall back to basic parsing
          console.error("[TM Scraper] Date parsing error:", e);
          try {
            const dateObj = new Date(sd.startDate);
            parsedData.date = dateObj.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            parsedData.time = dateObj.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            parsedData.dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
          } catch {
            // Complete failure, leave as null
          }
        }
      }
    }

    // Fall back to scraped text if structured data missing fields
    if (!parsedData.eventName && eventData.eventName) {
      parsedData.eventName = eventData.eventName;
    }
    
    // Use artist name from breadcrumb if we don't have it from structured data
    if (!parsedData.artistName && eventData.artistName) {
      parsedData.artistName = eventData.artistName;
    }
    
    // If still no artist name, try to extract from event name
    if (!parsedData.artistName && parsedData.eventName) {
      // Common patterns: "Artist - Tour Name", "Artist: Tour Name", "Artist Name"
      const eventNameStr = parsedData.eventName;
      
      // Try splitting by common delimiters first
      if (eventNameStr.includes(" - ")) {
        parsedData.artistName = eventNameStr.split(" - ")[0].trim();
      } else if (eventNameStr.includes(": ")) {
        parsedData.artistName = eventNameStr.split(": ")[0].trim();
      } else if (eventNameStr.includes(" @ ") || eventNameStr.includes(" at ")) {
        parsedData.artistName = eventNameStr.split(/\s+(@|at)\s+/i)[0].trim();
      } else if (eventNameStr.includes(" vs.") || eventNameStr.includes(" vs ")) {
        // Sports events - use full name
        parsedData.artistName = eventNameStr.split(/\s+vs\.?\s+/i)[0].trim();
      } else {
        // Try patterns like "ARTIST WORLD TOUR" or "ARTIST IN CITY"
        // Pattern: Extract text before common tour/location keywords
        const tourPatterns = [
          /^(.+?)\s+WORLD\s+TOUR/i,
          /^(.+?)\s+TOUR\b/i,
          /^(.+?)\s+LIVE\b/i,
          /^(.+?)\s+IN\s+(LOS\s+ANGELES|NEW\s+YORK|CHICAGO|MIAMI|DALLAS|HOUSTON|ATLANTA|BOSTON|SEATTLE|DENVER|PHOENIX|LAS\s+VEGAS|EAST\s+RUTHERFORD|INGLEWOOD|VANCOUVER|TORONTO|STANFORD|SAN\s+FRANCISCO|OAKLAND|SAN\s+JOSE|SACRAMENTO|PORTLAND|PHILADELPHIA|WASHINGTON|BALTIMORE)/i,
          /^(.+?)\s+PRESENTS/i,
        ];
        
        for (const pattern of tourPatterns) {
          const match = eventNameStr.match(pattern);
          if (match && match[1]) {
            // Clean up the extracted artist name
            let artist = match[1].trim();
            // Remove trailing special chars
            artist = artist.replace(/[:'"\-\s]+$/, "").trim();
            if (artist.length > 1 && artist.length < 50) {
              parsedData.artistName = artist;
              break;
            }
          }
        }
      }
    }

    if (!parsedData.venue && eventData.venueText) {
      // Clean up venue text - remove common prefixes like "Sign In"
      let cleanVenueText = eventData.venueText
        .replace(/^Sign\s*In\s*/i, "")
        .replace(/^Log\s*In\s*/i, "")
        .trim();
      
      // Try "Venue • City, State" format (queue pages use this)
      // e.g., "Stanford Stadium • Stanford, CA"
      const bulletVenuePattern = /^(.+?)\s*[•·]\s*([^,]+),\s*([A-Z]{2})\s*$/i;
      const bulletMatch = cleanVenueText.match(bulletVenuePattern);
      
      if (bulletMatch) {
        parsedData.venue = bulletMatch[1].trim();
        parsedData.venueCity = bulletMatch[2].trim();
        parsedData.venueState = bulletMatch[3].trim();
      } else {
        // Try concatenated text pattern
        const concatenatedPattern = /^(.*?)(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*[•·]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})\s*[•·]\s*(\d{1,2}:\d{2}\s*(AM|PM))\s*(.+?)\s*[•·]\s*(.+)$/i;
        const concatenatedMatch = cleanVenueText.match(concatenatedPattern);
        
        if (concatenatedMatch) {
          const venueName = concatenatedMatch[7]?.trim();
          const cityState = concatenatedMatch[8]?.trim();
          
          if (venueName && !parsedData.venue) {
            parsedData.venue = venueName;
          }
          
          if (cityState) {
            const cityStateParts = cityState.split(",").map((s: string) => s.trim());
            if (cityStateParts.length >= 1 && !parsedData.venueCity) {
              parsedData.venueCity = cityStateParts[0];
            }
            if (cityStateParts.length >= 2 && !parsedData.venueState) {
              parsedData.venueState = cityStateParts[1];
            }
          }
          
          if (!parsedData.dayOfWeek) {
            parsedData.dayOfWeek = concatenatedMatch[2];
          }
          if (!parsedData.date) {
            const currentYear = new Date().getFullYear();
            parsedData.date = `${concatenatedMatch[3]} ${concatenatedMatch[4]}, ${currentYear}`;
          }
          if (!parsedData.time) {
            parsedData.time = concatenatedMatch[5];
          }
        } else {
          // Fall back to comma parsing for "BC Place, Vancouver, BC" format
          const venueParts = cleanVenueText.split(",").map((s: string) => s.trim());
          if (venueParts.length >= 1) {
            parsedData.venue = venueParts[0];
          }
          if (venueParts.length >= 2) {
            parsedData.venueCity = venueParts[1];
          }
          if (venueParts.length >= 3) {
            parsedData.venueState = venueParts[2];
          }
        }
      }
    }

    if (!parsedData.date && eventData.dateTimeText) {
      // Parse date text like "Sat • May 16 • 7:00 PM" (queue pages)
      // or "Wed • Aug 19 • 7:30 PM"
      const dateTimeStr = eventData.dateTimeText;
      
      // Extract day of week
      const dayMatch = dateTimeStr.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i);
      if (dayMatch) {
        parsedData.dayOfWeek = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase();
      }
      
      // Extract month and day (handles both "May 16" and "Aug 19" formats)
      const monthDayMatch = dateTimeStr.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i);
      if (monthDayMatch) {
        const currentYear = new Date().getFullYear();
        parsedData.date = `${monthDayMatch[1]} ${monthDayMatch[2]}, ${currentYear}`;
      }
      
      // Extract time
      const timeMatch = dateTimeStr.match(/\b(\d{1,2}:\d{2}\s*(AM|PM))\b/i);
      if (timeMatch) {
        parsedData.time = timeMatch[1];
      }
    }
    
    // Use page title as fallback for date if not found
    // Page title format: "Event Name Tickets 2026-05-16 City, ST | Ticketmaster"
    if (!parsedData.date && eventData.pageTitle) {
      const titleDateMatch = eventData.pageTitle.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (titleDateMatch) {
        const [, year, month, day] = titleDateMatch;
        const monthNames = ["January", "February", "March", "April", "May", "June",
                           "July", "August", "September", "October", "November", "December"];
        const monthName = monthNames[parseInt(month, 10) - 1];
        parsedData.date = `${monthName} ${parseInt(day, 10)}, ${year}`;
        
        // Also extract day of week if not set
        if (!parsedData.dayOfWeek) {
          const dateObj = new Date(parseInt(year), parseInt(month, 10) - 1, parseInt(day, 10));
          parsedData.dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
        }
      }
      
      // Also try to extract venue city/state from title if not set
      // Pattern: "City, ST | Ticketmaster"
      if (!parsedData.venueCity || !parsedData.venueState) {
        const titleVenueMatch = eventData.pageTitle.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s*\|/);
        if (titleVenueMatch) {
          if (!parsedData.venueCity) {
            parsedData.venueCity = titleVenueMatch[1].trim();
          }
          if (!parsedData.venueState) {
            parsedData.venueState = titleVenueMatch[2].trim();
          }
        }
      }
    }

    return parsedData;

  } catch (error) {
    console.error("[TM Scraper] Error:", error);
    return {
      eventName: null,
      artistName: null,
      venue: null,
      venueCity: null,
      venueState: null,
      date: null,
      time: null,
      dayOfWeek: null,
      url,
      scrapedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Scraping failed",
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
