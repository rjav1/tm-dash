/**
 * Vivid Seats Web Scraper
 * 
 * Scrapes Vivid Seats website to extract "get in" (cheapest) ticket prices.
 * Uses Puppeteer for JavaScript-rendered content.
 * 
 * Note: Web scraping may violate Vivid Seats ToS - use at your own risk.
 * Prices are cached for 5 minutes to reduce scraping load.
 */

import puppeteer, { Browser, Page } from "puppeteer";

export interface SectionInfo {
  sectionName: string;
  zoneName: string;
  zoneId: string;
  colorHex?: string;
  minPrice: number;
  imageUrl?: string;        // View from seat image
  mapboxId?: string;        // ID for interactive map
  rowRange?: string;        // e.g., "1-8"
}

export interface SectionPrice {
  sectionName: string;
  minPrice: number;
}

export interface ZonePrice {
  zoneName: string;
  minPrice: number;
  colorHex?: string;
  sections?: string[];           // Section names (for backward compatibility)
  sectionPrices?: SectionPrice[]; // Section-level prices
  zoneId?: string;
}

export interface VenueMapInfo {
  venueId: string;
  venueName: string;
  staticMapUrl: string | null;
  svgFileName: string | null;
  jsonFileName: string | null;
}

export interface VividSeatsPrice {
  getInPrice: number | null;
  zonePrices: ZonePrice[];
  sectionDetails?: SectionInfo[];  // Detailed section data with images
  venueMap?: VenueMapInfo;
  currency: string;
  url: string | null;
  scrapedAt: string;
  error?: string;
}

// Simple in-memory cache for prices (no TTL enforcement - user controls when to refresh)
const priceCache = new Map<string, { data: VividSeatsPrice; timestamp: number }>();

// Singleton browser instance
let browserInstance: Browser | null = null;

/**
 * Get or create the browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920x1080",
      ],
    });
  }
  return browserInstance;
}

/**
 * Close the Vivid Seats browser instance (call on app shutdown)
 */
export async function closeVividSeatsBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Generate cache key from search params
 */
function getCacheKey(artistName: string, venue?: string, date?: string): string {
  return `${artistName.toLowerCase()}_${venue?.toLowerCase() || ""}_${date || ""}`;
}

/**
 * Build a Vivid Seats search URL from event data
 */
function buildVividSeatsSearchUrl(artistName: string, venue?: string, city?: string, date?: string): string {
  // Build a very specific search term
  let searchTerm = artistName;
  
  // Add city for more specific results
  if (city) {
    searchTerm += ` ${city}`;
  } else if (venue) {
    // Extract city from venue if possible (e.g., "SoFi Stadium, Inglewood, CA" -> "Inglewood")
    const parts = venue.split(",").map(p => p.trim());
    if (parts.length >= 2) {
      searchTerm += ` ${parts[1]}`; // Usually city is second part
    }
  }
  
  // Add venue name (first part)
  if (venue) {
    const venueName = venue.split(",")[0].trim();
    if (venueName && !searchTerm.toLowerCase().includes(venueName.toLowerCase())) {
      searchTerm += ` ${venueName}`;
    }
  }
  
  return `https://www.vividseats.com/search?searchTerm=${encodeURIComponent(searchTerm)}`;
}

/**
 * Parse date string to extract month, day, year
 */
function parseDate(dateStr: string): { month: number; day: number; year: number } | null {
  try {
    // Try various date formats
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return {
        month: date.getMonth() + 1,
        day: date.getDate(),
        year: date.getFullYear(),
      };
    }
    
    // Try parsing "October 7, 2026" format
    const match = dateStr.match(/(\w+)\s+(\d+),?\s+(\d{4})/);
    if (match) {
      const months: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
      };
      const monthNum = months[match[1].toLowerCase()];
      if (monthNum) {
        return { month: monthNum, day: parseInt(match[2]), year: parseInt(match[3]) };
      }
    }
  } catch {
    // Parsing failed
  }
  return null;
}

/**
 * Search Vivid Seats and get the "get in" price
 */
export async function getGetInPrice(params: {
  artistName: string;
  venue?: string;
  date?: string;
}): Promise<VividSeatsPrice> {
  const cacheKey = getCacheKey(params.artistName, params.venue, params.date);
  
  // Check cache - always return cached data if available (user controls when to refresh)
  const cached = priceCache.get(cacheKey);
  if (cached) {
    console.log("[VS Scraper] Returning cached price");
    return cached.data;
  }
  
  let page: Page | null = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Parse venue to extract city
    let city: string | undefined;
    if (params.venue) {
      const parts = params.venue.split(",").map(p => p.trim());
      if (parts.length >= 2) {
        city = parts[1]; // Usually city is second part
      }
    }
    
    // Build search URL
    const searchUrl = buildVividSeatsSearchUrl(params.artistName, params.venue, city, params.date);
    console.log(`[VS Scraper] Searching: ${searchUrl}`);
    console.log(`[VS Scraper] Looking for: artist="${params.artistName}", venue="${params.venue}", date="${params.date}"`);
    
    await page.goto(searchUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to find and click on the best matching event
    const eventUrl = await findAndClickEvent(page, params);
    
    if (!eventUrl) {
      console.log("[VS Scraper] No matching event found in search results");
      const result: VividSeatsPrice = {
        getInPrice: null,
        zonePrices: [],
        currency: "USD",
        url: searchUrl,
        scrapedAt: new Date().toISOString(),
        error: "No matching event found on Vivid Seats",
      };
      priceCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
    
    console.log(`[VS Scraper] Found event: ${eventUrl}`);
    
    // Add quantity=2 parameter to get prices for pairs of tickets (more realistic pricing)
    const eventUrlWithQuantity = new URL(eventUrl);
    eventUrlWithQuantity.searchParams.set("quantity", "2");
    const finalEventUrl = eventUrlWithQuantity.toString();
    
    // Navigate to event page
    await page.goto(finalEventUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    
    // Wait for prices to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract zone-level prices with section details AND API get-in price (all from same API call)
    // This is the primary source of truth for pricing with qty=2 filter
    const { zonePrices, sectionDetails, apiGetInPrice } = await extractZonePrices(page);
    console.log(`[VS Scraper] Extracted ${zonePrices.length} zone prices, ${sectionDetails.length} sections`);
    
    // Use API get-in price if available, otherwise fall back to DOM extraction
    let finalGetInPrice = apiGetInPrice;
    if (!finalGetInPrice) {
      console.log("[VS Scraper] No API price, falling back to DOM extraction");
      const priceData = await extractPrice(page);
      finalGetInPrice = priceData.price;
    }
    
    console.log(`[VS Scraper] Final get-in price: $${finalGetInPrice}`);
    
    const result: VividSeatsPrice = {
      getInPrice: finalGetInPrice,
      zonePrices,
      sectionDetails,
      currency: "USD",
      url: eventUrl,
      scrapedAt: new Date().toISOString(),
      error: finalGetInPrice === null ? "Could not extract price from page" : undefined,
    };
    
    priceCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
    
  } catch (error) {
    console.error("[VS Scraper] Error:", error);
    
    const result: VividSeatsPrice = {
      getInPrice: null,
      zonePrices: [],
      currency: "USD",
      url: null,
      scrapedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown scraping error",
    };
    
    return result;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Find the best matching event from search results and return its URL
 */
async function findAndClickEvent(
  page: Page,
  params: { artistName: string; venue?: string; date?: string }
): Promise<string | null> {
  try {
    const parsedDate = params.date ? parseDate(params.date) : null;
    
    // Find all event links on the page
    const eventLinks = await page.evaluate((searchParams) => {
      const results: Array<{ href: string; text: string }> = [];
      
      // Look for links that could be events
      const allLinks = document.querySelectorAll('a[href*="/production/"], a[href*="-tickets-"]');
      
      allLinks.forEach(link => {
        const anchor = link as HTMLAnchorElement;
        if (anchor.href && !results.some(r => r.href === anchor.href)) {
          // Get the parent container text for better matching
          const container = anchor.closest('div, li, article') || anchor;
          results.push({
            href: anchor.href,
            text: container.textContent?.trim().slice(0, 500) || "",
          });
        }
      });
      
      return results;
    }, params);
    
    console.log(`[VS Scraper] Found ${eventLinks.length} potential event links`);
    
    if (eventLinks.length === 0) {
      return null;
    }
    
    // Score each link based on how well it matches our criteria
    const artistLower = params.artistName.toLowerCase();
    
    // Extract venue parts for matching
    const venueParts = params.venue?.split(",").map(p => p.trim().toLowerCase()) || [];
    const venueName = venueParts[0] || ""; // e.g., "sofi stadium"
    const cityName = venueParts[1] || ""; // e.g., "inglewood"
    
    const scored = eventLinks.map(link => {
      let score = 0;
      const textLower = link.text.toLowerCase();
      const hrefLower = link.href.toLowerCase();
      
      // Artist name match (required)
      const artistWords = artistLower.split(/\s+/);
      const artistMatch = artistWords.every(word => 
        textLower.includes(word) || hrefLower.includes(word)
      );
      if (!artistMatch) {
        return { link, score: -1 }; // Disqualify if artist doesn't match
      }
      score += 10;
      
      // Venue name match (high priority)
      if (venueName) {
        const venueWords = venueName.split(/\s+/).filter(w => w.length > 2);
        const venueMatches = venueWords.filter(word => 
          textLower.includes(word) || hrefLower.includes(word)
        );
        score += venueMatches.length * 5;
        
        // Exact venue match in URL (very strong signal)
        const normalizedVenue = venueName.replace(/\s+/g, "-");
        if (hrefLower.includes(normalizedVenue)) {
          score += 15;
        }
      }
      
      // City match (high priority)
      if (cityName && cityName.length > 2) {
        if (textLower.includes(cityName) || hrefLower.includes(cityName)) {
          score += 10;
        }
      }
      
      // Date match (very high priority)
      if (parsedDate) {
        // Check for date in URL format: m-d-yyyy or mm-dd-yyyy
        const datePatterns = [
          `${parsedDate.month}-${parsedDate.day}-${parsedDate.year}`,
          `${parsedDate.month.toString().padStart(2, '0')}-${parsedDate.day.toString().padStart(2, '0')}-${parsedDate.year}`,
        ];
        
        for (const pattern of datePatterns) {
          if (hrefLower.includes(pattern)) {
            score += 25; // Strong bonus for exact date match in URL
            break;
          }
        }
        
        // Check for month and day in text
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const monthName = monthNames[parsedDate.month - 1];
        if (textLower.includes(monthName) && textLower.includes(String(parsedDate.day))) {
          score += 15;
        }
      }
      
      // Prefer production URLs
      if (link.href.includes("/production/")) {
        score += 5;
      }
      
      return { link, score };
    });
    
    // Filter out disqualified links and sort by score
    const validScored = scored.filter(s => s.score >= 0);
    validScored.sort((a, b) => b.score - a.score);
    
    if (validScored.length > 0 && validScored[0].score >= 10) {
      return validScored[0].link.href;
    }
    
    return null;
  } catch (error) {
    console.error("[VS Scraper] Error finding event link:", error);
    return null;
  }
}

/**
 * Extract price from the event page
 */
async function extractPrice(page: Page): Promise<{ price: number | null; currency: string | null }> {
  try {
    const priceData = await page.evaluate(() => {
      const prices: number[] = [];
      
      // Method 1: Look for the FAQ section that says "tickets start at $X"
      const allText = document.body.innerText || "";
      const startAtMatch = allText.match(/tickets\s+start\s+at\s+\$?([\d,]+)/i);
      if (startAtMatch) {
        const price = parseFloat(startAtMatch[1].replace(/,/g, ""));
        if (!isNaN(price) && price > 0) {
          prices.push(price);
        }
      }
      
      // Method 2: Look for "lowest price" pattern
      const lowestPriceMatch = allText.match(/lowest\s+price[^$]*\$?([\d,]+)/i);
      if (lowestPriceMatch) {
        const price = parseFloat(lowestPriceMatch[1].replace(/,/g, ""));
        if (!isNaN(price) && price > 0) {
          prices.push(price);
        }
      }
      
      // Method 3: Look for specific price elements
      const priceSelectors = [
        '[data-testid="get-in-price"]',
        '[data-testid="listing-price"]',
        '.listing-price',
        '.ticket-price',
        // Look for elements with price-like classes
        '[class*="price" i]',
        '[class*="Price" i]',
      ];
      
      for (const selector of priceSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent || "";
            // Match prices like "$173" or "$1,234" or "$173 ea"
            const matches = text.match(/\$[\d,]+(?:\.\d{2})?/g);
            if (matches) {
              matches.forEach(match => {
                const num = parseFloat(match.replace(/[$,]/g, ""));
                if (!isNaN(num) && num > 0 && num < 50000) {
                  prices.push(num);
                }
              });
            }
          });
        } catch {
          // Selector failed
        }
      }
      
      // Method 4: Look for structured data
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent || "");
          if (data.offers?.lowPrice) {
            prices.push(parseFloat(data.offers.lowPrice));
          }
          if (data.offers?.price) {
            prices.push(parseFloat(data.offers.price));
          }
          // Handle array of offers
          if (Array.isArray(data.offers)) {
            data.offers.forEach((offer: any) => {
              if (offer.price) prices.push(parseFloat(offer.price));
              if (offer.lowPrice) prices.push(parseFloat(offer.lowPrice));
            });
          }
        } catch {
          // JSON parse error
        }
      });
      
      // Method 5: Look for listing rows with prices
      const listingRows = document.querySelectorAll('[class*="listing"], [class*="Listing"], tr, li');
      listingRows.forEach(row => {
        const text = row.textContent || "";
        // Look for price patterns in listing rows
        const priceMatches = text.match(/\$[\d,]+(?:\s*ea)?/gi);
        if (priceMatches) {
          priceMatches.forEach(match => {
            const num = parseFloat(match.replace(/[$,\s]|ea/gi, ""));
            if (!isNaN(num) && num > 20 && num < 50000) {
              prices.push(num);
            }
          });
        }
      });
      
      // Return the lowest price found
      if (prices.length > 0) {
        const uniquePrices = [...new Set(prices)].sort((a, b) => a - b);
        console.log("Found prices:", uniquePrices.slice(0, 5));
        return { price: uniquePrices[0], currency: "USD" };
      }
      
      return { price: null, currency: null };
    });
    
    return priceData;
  } catch (error) {
    console.error("[VS Scraper] Error extracting price:", error);
    return { price: null, currency: null };
  }
}

/**
 * Helper to convert RGB color string to hex
 */
function rgbToHex(rgb: string): string | null {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return null;
}

interface ZonePriceResult {
  zonePrices: ZonePrice[];
  sectionDetails: SectionInfo[];
  venueInfo?: VenueMapInfo | null;
}

/**
 * Extract zone-level prices using the Vivid Seats API
 * This is more reliable than DOM scraping since it gets raw listing data
 * Now also returns detailed section info with images for visual selection
 * Uses qty=2 to filter for listings with at least 2 tickets available
 */
async function extractZonePrices(page: Page): Promise<ZonePriceResult & { apiGetInPrice: number | null }> {
  try {
    const url = page.url();
    const productionIdMatch = url.match(/\/production\/(\d+)/);
    
    if (!productionIdMatch) {
      console.log("[VS Scraper] Could not extract production ID from URL");
      return { zonePrices: [], sectionDetails: [], apiGetInPrice: null };
    }
    
    const productionId = productionIdMatch[1];
    console.log(`[VS Scraper] Fetching listings from API for production ${productionId} with qty=2`);
    
    // Use the correct Vivid Seats API with qty=2 to filter for pairs
    // This returns: { groups: [...zones], sections: [...], tickets: [...] }
    const apiData = await page.evaluate(async (prodId) => {
      try {
        // Add qty=2 to filter for listings with at least 2 tickets
        // priceGroupId=21 seems to be required for full data
        const response = await fetch(
          `https://www.vividseats.com/hermes/api/v1/listings?productionId=${prodId}&includeIpAddress=true&currency=USD&localizeCurrency=true&priceGroupId=21&qty=2`,
          {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            }
          }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // Extract the key data structures including global venue info
        return {
          groups: data.groups || [],      // Zones with id, name, color, min/max prices
          sections: data.sections || [],  // Sections with group mapping, all-in prices, images
          tickets: data.tickets || [],    // Individual listings
          ticketCount: data.tickets?.length || 0,
          global: data.global || null     // Venue info including venueId, mapTitle, staticMapUrl
        };
      } catch (e) {
        console.error('API fetch error:', e);
        return null;
      }
    }, productionId);
    
    if (!apiData || (apiData.groups.length === 0 && apiData.ticketCount === 0)) {
      console.log("[VS Scraper] No data from API, falling back to DOM scraping");
      const fallbackZones = await extractZonePricesFromDOM(page);
      return { zonePrices: fallbackZones, sectionDetails: [], apiGetInPrice: null };
    }
    
    console.log(`[VS Scraper] API returned ${apiData.groups.length} groups, ${apiData.sections.length} sections, ${apiData.ticketCount} tickets`);
    console.log(`[VS Scraper] Global data present: ${!!apiData.global}, venueId: ${apiData.global?.venueId}, mapTitle: ${apiData.global?.mapTitle}`);
    
    // Build zone data from groups and sections
    // Groups structure: { i: "zoneId", n: "zoneName", c: "0xCOLOR", l: "minPrice", h: "maxPrice" }
    // Sections structure: { i, g: "groupId", n: "sectionName", laip: "lowestAllInPrice", si: imageUrl, mbi: mapboxId, rd: rowRange }
    
    const zonePrices: ZonePrice[] = [];
    const sectionDetails: SectionInfo[] = [];
    const groupMap = new Map<string, { id: string; name: string; color: string; sections: string[]; minAllInPrice: number }>();
    
    // First, initialize from groups
    for (const group of apiData.groups) {
      const groupId = group.i;
      const zoneName = group.n;
      const colorHex = group.c?.replace('0x', '#') || null;
      
      groupMap.set(groupId, {
        id: groupId,
        name: zoneName,
        color: colorHex,
        sections: [],
        minAllInPrice: Infinity
      });
    }
    
    // Then, add section data and find min all-in prices per zone
    // Also build section details for visual selection
    for (const section of apiData.sections) {
      const groupId = section.g;
      const sectionName = section.n;
      const allInPrice = parseFloat(section.laip || section.l || '0');
      const imageUrl = section.si || null;
      const mapboxId = section.mbi || null;
      const rowRange = section.rd || null;
      
      const group = groupMap.get(groupId);
      if (group) {
        group.sections.push(sectionName);
        if (allInPrice > 0 && allInPrice < group.minAllInPrice) {
          group.minAllInPrice = allInPrice;
        }
        
        // Add detailed section info for visual selection
        sectionDetails.push({
          sectionName,
          zoneName: group.name,
          zoneId: groupId,
          colorHex: group.color || undefined,
          minPrice: allInPrice > 0 ? Math.round(allInPrice) : 0,
          imageUrl: imageUrl || undefined,
          mapboxId: mapboxId || undefined,
          rowRange: rowRange || undefined
        });
      }
    }
    
    // If we didn't get all-in prices from sections, calculate from tickets
    if (apiData.tickets && apiData.tickets.length > 0) {
      // tickets have: s (section), aip (all-in price), c (sectionId)
      // We need to map section to group
      const sectionToGroup = new Map<string, string>();
      for (const section of apiData.sections) {
        sectionToGroup.set(section.n, section.g);
      }
      
      for (const ticket of apiData.tickets) {
        const sectionName = ticket.s || ticket.sectionName;
        const allInPrice = parseFloat(ticket.aip || ticket.allInPricePerTicket || '0');
        const groupId = sectionToGroup.get(sectionName) || ticket.c;
        
        if (groupMap.has(groupId) && allInPrice > 0) {
          const group = groupMap.get(groupId)!;
          if (allInPrice < group.minAllInPrice) {
            group.minAllInPrice = allInPrice;
          }
        }
      }
    }
    
    // Build a map of zone name to section prices from sectionDetails
    const zoneSectionPricesMap = new Map<string, SectionPrice[]>();
    for (const section of sectionDetails) {
      if (!zoneSectionPricesMap.has(section.zoneName)) {
        zoneSectionPricesMap.set(section.zoneName, []);
      }
      zoneSectionPricesMap.get(section.zoneName)!.push({
        sectionName: section.sectionName,
        minPrice: section.minPrice
      });
    }
    
    // Convert to ZonePrice array with section prices
    groupMap.forEach((data, groupId) => {
      if (data.minAllInPrice < Infinity) {
        const sectionPricesForZone = zoneSectionPricesMap.get(data.name) || [];
        zonePrices.push({
          zoneName: data.name,
          minPrice: Math.round(data.minAllInPrice),
          colorHex: data.color || undefined,
          sections: data.sections.length > 0 ? data.sections.sort() : undefined,
          sectionPrices: sectionPricesForZone.length > 0 ? sectionPricesForZone : undefined,
          zoneId: groupId
        });
        console.log(`[VS Scraper] Zone "${data.name}": $${Math.round(data.minAllInPrice)} (${data.sections.length} sections)`);
      }
    });
    
    // Sort by price
    zonePrices.sort((a, b) => a.minPrice - b.minPrice);
    sectionDetails.sort((a, b) => a.minPrice - b.minPrice);
    
    // Calculate API get-in price from tickets (minimum all-in price)
    // This is the most accurate price since it comes from actual filtered listings
    // IMPORTANT: Filter to only include listings with 2+ tickets available
    let apiGetInPrice: number | null = null;
    if (apiData.tickets && apiData.tickets.length > 0) {
      // Filter tickets to only include listings with qty=2 or qty>=4 (exclude singles and triples)
      // The API returns all listings regardless of qty parameter - we must filter client-side
      const filteredTickets = apiData.tickets.filter((t: { q?: string; quantity?: string }) => {
        const qty = parseInt(t.q || t.quantity || '0', 10);
        return qty === 2 || qty >= 4;
      });
      
      const ticketPrices = filteredTickets
        .map((t: { aip?: string; allInPricePerTicket?: string }) => 
          parseFloat(t.aip || t.allInPricePerTicket || '0'))
        .filter((p: number) => p > 0);
      if (ticketPrices.length > 0) {
        apiGetInPrice = Math.round(Math.min(...ticketPrices));
        console.log(`[VS Scraper] API get-in price (from ${ticketPrices.length} tickets with qty=2 or qty>=4): $${apiGetInPrice}`);
      } else {
        console.log(`[VS Scraper] No tickets found with qty=2 or qty>=4, falling back to all tickets`);
      }
    }
    // Fallback to minimum zone price if no ticket prices
    if (!apiGetInPrice && zonePrices.length > 0) {
      apiGetInPrice = zonePrices[0].minPrice;
      console.log(`[VS Scraper] API get-in price (from zone min): $${apiGetInPrice}`);
    }
    
    // Extract venue info from the global data (captured from the same API call)
    const global = apiData.global || {};
    const venueInfo = {
      venueId: global.venueId || productionId,
      venueName: global.mapTitle || "Unknown Venue",
      staticMapUrl: global.staticMapUrl || null,
      svgFileName: global.svgFileName || null,
      jsonFileName: global.jsonFileName || null,
    };
    
    console.log(`[VS Scraper] Extracted ${zonePrices.length} zones, ${sectionDetails.length} sections from API`);
    console.log(`[VS Scraper] Venue info: ${venueInfo.venueName} (${venueInfo.venueId})`);
    
    return { zonePrices, sectionDetails, venueInfo, apiGetInPrice };
    
  } catch (error) {
    console.error("[VS Scraper] Error extracting zone prices from API:", error);
    const fallbackZones = await extractZonePricesFromDOM(page);
    return { zonePrices: fallbackZones, sectionDetails: [], venueInfo: null, apiGetInPrice: null };
  }
}

/**
 * Fallback: Extract zone prices from DOM by clicking zone buttons
 * Improved: looks specifically at listing links, not featured cards
 */
async function extractZonePricesFromDOM(page: Page): Promise<ZonePrice[]> {
  const zonePrices: ZonePrice[] = [];
  
  try {
    // NEW APPROACH: Extract all listings on the page and group by zone/section
    // This avoids the unreliable zone button clicking
    
    const extractedData = await page.evaluate(() => {
      interface ListingData {
        section: string;
        zone: string | null;
        price: number;
        zoneColor: string | null;
      }
      
      const listings: ListingData[] = [];
      const zoneButtons: Array<{ name: string; colorHex: string | null }> = [];
      
      // STEP 1: Get zone names and colors from the Filter by Zone section
      const allElements = document.querySelectorAll('*');
      let zoneContainer: Element | null = null;
      
      for (const el of allElements) {
        const text = el.textContent?.trim() || "";
        if (text === "Filter by Zone") {
          zoneContainer = el.parentElement;
          break;
        }
      }
      
      if (zoneContainer) {
        const buttons = zoneContainer.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.trim().replace(/\s+/g, ' ') || "";
          if (!text || text.length < 3 || text.length > 35) continue;
          
          // Skip UI elements
          const skipPatterns = [
            /^trending$/i, /^usd$/i, /^dismiss$/i, /^info/i, /^any\s*quantity$/i,
            /^perks$/i, /^lowest\s*price$/i, /^skip$/i, /^filter/i, /^sort/i,
            /^clear/i, /^apply/i, /^reset/i, /^show/i, /^hide/i, /^view/i,
            /^see\s*all/i, /^more$/i, /^\d+$/, /^x$/i, /\$/,
          ];
          if (skipPatterns.some(p => p.test(text))) continue;
          
          // Get color indicator
          let colorHex: string | null = null;
          const indicators = btn.querySelectorAll('span, div');
          for (const ind of indicators) {
            const style = window.getComputedStyle(ind);
            const bg = style.backgroundColor;
            const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
              const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
              if (!(r > 240 && g > 240 && b > 240) && !(r < 15 && g < 15 && b < 15)) {
                colorHex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
                break;
              }
            }
          }
          
          if (!zoneButtons.some(z => z.name === text)) {
            zoneButtons.push({ name: text, colorHex });
          }
        }
      }
      
      // STEP 2: Extract all listings from the page
      // Each listing card shows: Section Name, Row X, Quantity, Price
      const listingCards = document.querySelectorAll('a[href*="/production/"]');
      
      for (const card of listingCards) {
        const text = card.textContent || "";
        
        // Skip featured/promotional cards
        if (text.includes('Lowest Price in Section')) continue;
        if (text.includes('Featured')) continue;
        
        // Extract price - look for "$XXX" pattern followed by "ea" or at end
        let price: number | null = null;
        const pricePatterns = [
          /\$(\d{1,3}(?:,\d{3})*)\s*ea/i,
          /Fees\s*Incl\.?\s*\$(\d{1,3}(?:,\d{3})*)/i,
        ];
        for (const pattern of pricePatterns) {
          const match = text.match(pattern);
          if (match) {
            price = parseInt(match[1].replace(/,/g, ''));
            break;
          }
        }
        
        if (!price || price < 20 || price > 50000) continue;
        
        // Extract section name from listing
        // Listings typically show: "[Section Name] Row X | X-X tickets"
        let section: string | null = null;
        const sectionPatterns = [
          // Hollywood Bowl specific
          /(Pool\s*Circle\s*[A-Z]?)/i,
          /(Promenade\s*[A-Z]?\d*)/i,
          /(Garden\s*(?:Boxes?)?\s*\d*)/i,
          /(Terrace\s*(?:Boxes?)?\s*\d*)/i,
          /(Ramp\s*Seats?)/i,
          /(Super\s*Seats?)/i,
          // Generic venue sections
          /(Floor\s*\d*)/i,
          /(Loge\s*(?:Level)?\s*\d*)/i,
          /(Balcony\s*(?:Level)?\s*\d*)/i,
          /(Club\s*(?:Level)?\s*\d*)/i,
          /(Lower\s*Level\s*\d*)/i,
          /(Upper\s*Level\s*\d*)/i,
          /(Mezzanine\s*\d*)/i,
          /(Orchestra\s*\d*)/i,
          /(Section\s*[A-Z0-9]+)/i,
          /(Sec\s*[A-Z0-9]+)/i,
          /^([A-Z]{1,4}\s*\d{1,3}[A-Z]?)\s+Row/i,
        ];
        
        for (const pattern of sectionPatterns) {
          const match = text.match(pattern);
          if (match) {
            section = match[1].trim();
            break;
          }
        }
        
        if (section) {
          // Try to match section to a zone
          let matchedZone: string | null = null;
          let zoneColor: string | null = null;
          
          const sectionLower = section.toLowerCase();
          for (const zone of zoneButtons) {
            const zoneLower = zone.name.toLowerCase();
            // Check if section contains the zone name or vice versa
            if (sectionLower.includes(zoneLower) || zoneLower.includes(sectionLower.split(/\s+/)[0])) {
              matchedZone = zone.name;
              zoneColor = zone.colorHex;
              break;
            }
          }
          
          listings.push({
            section,
            zone: matchedZone,
            price,
            zoneColor
          });
        }
      }
      
      return { zoneButtons, listings };
    });
    
    console.log(`[VS Scraper] DOM: Found ${extractedData.zoneButtons.length} zones, ${extractedData.listings.length} listings`);
    
    // Group listings by zone and find min price
    const zoneMap = new Map<string, { minPrice: number; sections: Set<string>; colorHex: string | null }>();
    
    // Initialize with zone buttons
    for (const zone of extractedData.zoneButtons) {
      zoneMap.set(zone.name, { minPrice: Infinity, sections: new Set(), colorHex: zone.colorHex });
    }
    
    // Process listings
    for (const listing of extractedData.listings) {
      const zoneName = listing.zone || listing.section; // Use section as zone if no zone match
      
      if (!zoneMap.has(zoneName)) {
        zoneMap.set(zoneName, { minPrice: Infinity, sections: new Set(), colorHex: listing.zoneColor });
      }
      
      const zone = zoneMap.get(zoneName)!;
      if (listing.price < zone.minPrice) {
        zone.minPrice = listing.price;
      }
      zone.sections.add(listing.section);
    }
    
    // Convert to array
    zoneMap.forEach((data, zoneName) => {
      if (data.minPrice < Infinity) {
        zonePrices.push({
          zoneName,
          minPrice: data.minPrice,
          colorHex: data.colorHex || undefined,
          sections: data.sections.size > 0 ? Array.from(data.sections).sort() : undefined
        });
        console.log(`[VS Scraper] DOM Zone "${zoneName}": $${data.minPrice} (${data.sections.size} sections)`);
      }
    });
    
    // Sort by price
    zonePrices.sort((a, b) => a.minPrice - b.minPrice);
    
    return zonePrices;
  } catch (error) {
    console.error("[VS Scraper] DOM extraction error:", error);
    return zonePrices;
  }
}


/**
 * Extract venue map information from the layout API
 */
async function extractVenueMapInfo(page: Page): Promise<VenueMapInfo | null> {
  try {
    const url = page.url();
    const productionIdMatch = url.match(/\/production\/(\d+)/);
    
    if (!productionIdMatch) {
      return null;
    }
    
    const productionId = productionIdMatch[1];
    
    const layoutData = await page.evaluate(async (prodId) => {
      try {
        const response = await fetch(
          `https://www.vividseats.com/hermes/api/v1/layout/${prodId}`
        );
        return await response.json();
      } catch {
        return null;
      }
    }, productionId);
    
    if (!layoutData) {
      return null;
    }
    
    // Also try to get venue info from listings API
    const listingsData = await page.evaluate(async (prodId) => {
      try {
        const response = await fetch(
          `https://www.vividseats.com/hermes/api/v1/listings?productionId=${prodId}&includeIpAddress=true&currency=USD&localizeCurrency=true`
        );
        return await response.json();
      } catch {
        return null;
      }
    }, productionId);
    
    // The global data is directly at listingsData.global, not listingsData.listings.global
    const global = listingsData?.global || {};
    
    return {
      venueId: global.venueId || productionId,
      venueName: global.mapTitle || "Unknown Venue",
      staticMapUrl: global.staticMapUrl || layoutData.staticMapUrl || null,
      svgFileName: global.svgFileName || layoutData.svgFileName || null,
      jsonFileName: global.jsonFileName || layoutData.jsonFileName || null,
    };
  } catch (error) {
    console.error("[VS Scraper] Error extracting venue map info:", error);
    return null;
  }
}

/**
 * Get the "get in" price directly from a Vivid Seats URL
 * Skips the search step and goes directly to the event page
 * @param url - Vivid Seats event URL
 * @param forceRefresh - If true, bypass the in-memory cache and always scrape fresh data
 */
export async function getGetInPriceFromUrl(url: string, forceRefresh: boolean = false): Promise<VividSeatsPrice> {
  // Use URL as cache key
  const cacheKey = `url_${url}`;
  
  // Check cache - return cached data unless forceRefresh is true
  if (!forceRefresh) {
    const cached = priceCache.get(cacheKey);
    if (cached) {
      console.log("[VS Scraper] Returning cached price for URL");
      return cached.data;
    }
  } else {
    // Clear cache entry if force refreshing
    priceCache.delete(cacheKey);
    console.log("[VS Scraper] Force refresh - bypassing cache");
  }
  
  let page: Page | null = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Add quantity=2 parameter to get prices for pairs of tickets (more realistic pricing)
    const urlWithQuantity = new URL(url);
    urlWithQuantity.searchParams.set("quantity", "2");
    const finalUrl = urlWithQuantity.toString();
    
    console.log(`[VS Scraper] Navigating directly to: ${finalUrl}`);
    
    await page.goto(finalUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    
    // Wait for prices to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract zone-level prices with section details, venue info, AND API get-in price (all from same API call)
    // This is the primary source of truth for pricing with qty=2 filter
    const { zonePrices, sectionDetails, venueInfo, apiGetInPrice } = await extractZonePrices(page);
    console.log(`[VS Scraper] Extracted ${zonePrices.length} zone prices, ${sectionDetails.length} sections from URL`);
    
    // Use API get-in price if available, otherwise fall back to DOM extraction
    let finalGetInPrice = apiGetInPrice;
    if (!finalGetInPrice) {
      console.log("[VS Scraper] No API price, falling back to DOM extraction");
      const priceData = await extractPrice(page);
      finalGetInPrice = priceData.price;
    }
    
    console.log(`[VS Scraper] Final get-in price: $${finalGetInPrice}`);
    
    // Use venue info from extractZonePrices (or fall back to extractVenueMapInfo if not available)
    let venueMap: VenueMapInfo | null = null;
    if (venueInfo) {
      venueMap = venueInfo;
      console.log(`[VS Scraper] Venue: ${venueMap.venueName} (ID: ${venueMap.venueId})`);
    } else {
      // Fallback to separate extraction if venue info wasn't in the main API response
      venueMap = await extractVenueMapInfo(page);
      if (venueMap) {
        console.log(`[VS Scraper] Extracted venue map for: ${venueMap.venueName}`);
      }
    }
    
    const result: VividSeatsPrice = {
      getInPrice: finalGetInPrice,
      zonePrices,
      sectionDetails,
      venueMap: venueMap || undefined,
      currency: "USD",
      url,
      scrapedAt: new Date().toISOString(),
      error: finalGetInPrice === null ? "Could not extract price from page" : undefined,
    };
    
    priceCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
    
  } catch (error) {
    console.error("[VS Scraper] Error scraping URL:", error);
    
    const result: VividSeatsPrice = {
      getInPrice: null,
      zonePrices: [],
      currency: "USD",
      url,
      scrapedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown scraping error",
    };
    
    return result;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Clear the price cache
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: priceCache.size,
    entries: Array.from(priceCache.keys()),
  };
}
