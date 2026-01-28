/**
 * Ticketmaster Event Page Scraper (Fetch-based)
 * 
 * Lightweight scraper that uses fetch instead of Puppeteer.
 * Works on Vercel serverless functions.
 * 
 * Scrapes event details directly from ticketmaster.com/event/{eventId}
 * 
 * Note: Dates are automatically converted to the venue's local timezone
 * based on the venue's state/province code.
 */

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

/**
 * Scrape event details from Ticketmaster event page using fetch
 */
export async function scrapeEventPageFetch(eventId: string): Promise<ScrapedEventData> {
  // Try different TM domains (US and Canada)
  const urls = [
    `https://www.ticketmaster.com/event/${eventId}`,
    `https://www.ticketmaster.ca/event/${eventId}`,
  ];

  let lastError: string | null = null;
  
  for (const url of urls) {
    const result = await tryFetchPage(url, eventId);
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

async function tryFetchPage(url: string, eventId: string): Promise<ScrapedEventData> {
  try {
    console.log(`[TM Fetch Scraper] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      if (response.status === 404) {
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Parse the HTML to extract event data
    const parsedData = parseEventHtml(html, url);
    
    console.log("[TM Fetch Scraper] Extracted data:", JSON.stringify(parsedData, null, 2));
    
    return parsedData;

  } catch (error) {
    console.error("[TM Fetch Scraper] Error:", error);
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
      error: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}

function parseEventHtml(html: string, url: string): ScrapedEventData {
  const result: ScrapedEventData = {
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

  // Try to extract JSON-LD structured data (most reliable)
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonLdContent = jsonLdMatch[1].trim();
      let data = JSON.parse(jsonLdContent);
      
      // Handle array format
      if (Array.isArray(data)) {
        data = data.find((item: any) => item["@type"] === "Event" || item["@type"] === "MusicEvent") || data[0];
      }
      
      if (data && (data["@type"] === "Event" || data["@type"] === "MusicEvent")) {
        result.eventName = data.name || null;
        
        // Get performer/artist name
        if (data.performer) {
          if (Array.isArray(data.performer)) {
            result.artistName = data.performer[0]?.name || null;
          } else {
            result.artistName = data.performer.name || null;
          }
        }
        
        // Get venue FIRST (needed for timezone conversion)
        if (data.location) {
          result.venue = data.location.name || null;
          if (data.location.address) {
            result.venueCity = data.location.address.addressLocality || null;
            result.venueState = data.location.address.addressRegion || null;
          }
        }
        
        // Get date/time - convert to venue's local timezone
        if (data.startDate) {
          try {
            // Check if Ticketmaster provided a timezone in the event data
            const tmTimezone = normalizeTimezone(data.timezone || data.dates?.timezone);
            
            if (tmTimezone) {
              // Use the timezone from Ticketmaster API directly
              const dateObj = new Date(data.startDate);
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
              
              result.date = dateFormatter.format(dateObj);
              result.time = timeFormatter.format(dateObj);
              result.dayOfWeek = dayFormatter.format(dateObj);
              
              console.log(`[TM Fetch Scraper] Converted date using TM timezone (${tmTimezone}): ${result.date} at ${result.time}`);
            } else {
              // Fall back to inferring timezone from venue state
              const converted = convertEventDateToVenueTimezone(data.startDate, result.venueState);
              result.date = converted.date;
              result.time = converted.time;
              result.dayOfWeek = converted.dayOfWeek;
            }
          } catch (e) {
            // Date parsing failed - fall back to basic parsing
            console.error("[TM Fetch Scraper] Date parsing error:", e);
            try {
              const dateObj = new Date(data.startDate);
              result.date = dateObj.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              });
              result.time = dateObj.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              result.dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
            } catch {
              // Complete failure, leave as null
            }
          }
        }
      }
    } catch (e) {
      console.log("[TM Fetch Scraper] JSON-LD parsing failed:", e);
    }
  }

  // If JSON-LD didn't give us everything, try other methods
  
  // Extract title tag - format: "Event Name Tickets Date City, ST | Ticketmaster"
  if (!result.eventName) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      // Remove " Tickets ... | Ticketmaster" suffix
      const nameMatch = title.match(/^(.+?)\s+Tickets?\s+/i);
      if (nameMatch) {
        result.eventName = nameMatch[1].trim();
      } else if (!title.toLowerCase().includes("ticketmaster")) {
        result.eventName = title.split("|")[0].trim();
      }
      
      // Try to extract date from title (format: 2026-05-16)
      if (!result.date) {
        const titleDateMatch = title.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (titleDateMatch) {
          const [, year, month, day] = titleDateMatch;
          const monthNames = ["January", "February", "March", "April", "May", "June",
                             "July", "August", "September", "October", "November", "December"];
          const monthName = monthNames[parseInt(month, 10) - 1];
          result.date = `${monthName} ${parseInt(day, 10)}, ${year}`;
          
          // Get day of week
          const dateObj = new Date(parseInt(year), parseInt(month, 10) - 1, parseInt(day, 10));
          result.dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
        }
      }
      
      // Try to extract city/state from title
      if (!result.venueCity || !result.venueState) {
        const cityStateMatch = title.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s*\|/);
        if (cityStateMatch) {
          result.venueCity = result.venueCity || cityStateMatch[1].trim();
          result.venueState = result.venueState || cityStateMatch[2].trim();
        }
      }
    }
  }

  // Extract from <h1> tag
  if (!result.eventName) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      const h1Text = h1Match[1].trim();
      if (h1Text.length > 3 && !h1Text.toLowerCase().includes("ticketmaster")) {
        result.eventName = h1Text;
      }
    }
  }

  // Try to extract artist from event name
  if (!result.artistName && result.eventName) {
    const eventNameStr = result.eventName;
    
    if (eventNameStr.includes(" - ")) {
      result.artistName = eventNameStr.split(" - ")[0].trim();
    } else if (eventNameStr.includes(": ")) {
      result.artistName = eventNameStr.split(": ")[0].trim();
    } else if (eventNameStr.includes(" @ ") || eventNameStr.includes(" at ")) {
      result.artistName = eventNameStr.split(/\s+(@|at)\s+/i)[0].trim();
    } else {
      // Try patterns like "ARTIST WORLD TOUR" or "ARTIST LIVE"
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
          let artist = match[1].trim().replace(/[:'"\-\s]+$/, "").trim();
          if (artist.length > 1 && artist.length < 50) {
            result.artistName = artist;
            break;
          }
        }
      }
    }
  }

  // Look for og:title meta tag as fallback
  if (!result.eventName) {
    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (ogTitleMatch) {
      result.eventName = ogTitleMatch[1].trim();
    }
  }

  // Look for venue in meta tags or content
  if (!result.venue) {
    // Try og:site_name or other venue indicators
    const venuePatterns = [
      /<a[^>]*href="[^"]*\/venue\/[^"]*"[^>]*>([^<]+)<\/a>/i,
      /venue['"]\s*:\s*['"]([^'"]+)['"]/i,
    ];
    
    for (const pattern of venuePatterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length > 3) {
        result.venue = match[1].trim();
        break;
      }
    }
  }

  return result;
}
