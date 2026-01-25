/**
 * Ticketmaster Discovery API Service
 * 
 * Uses the Discovery API to search for and retrieve event details.
 * API Key is stored in environment variable TICKETMASTER_API_KEY
 * 
 * Rate Limits: 5000 requests/day, 5 requests/second
 */

const API_KEY = process.env.TICKETMASTER_API_KEY || "GkoVctOARN0hm9HUq3wsvs55u2QwpJ8y";
const BASE_URL = "https://app.ticketmaster.com/discovery/v2";

export interface TicketmasterVenue {
  id: string;
  name: string;
  city: string;
  state: string;
  stateCode: string;
  country: string;
  countryCode: string;
  address?: string;
  postalCode?: string;
  timezone?: string;
  location?: {
    latitude: string;
    longitude: string;
  };
}

export interface TicketmasterEvent {
  discoveryId: string;
  name: string;
  date: string;
  time?: string;
  dateTime?: string;
  timezone?: string;
  status?: string;
  venue: TicketmasterVenue | null;
  images: Array<{
    url: string;
    width: number;
    height: number;
    ratio: string;
  }>;
  url?: string;
  priceRanges?: Array<{
    type: string;
    currency: string;
    min: number;
    max: number;
  }>;
  classifications?: Array<{
    segment?: { name: string };
    genre?: { name: string };
    subGenre?: { name: string };
  }>;
}

export interface SearchResult {
  events: TicketmasterEvent[];
  totalElements: number;
  totalPages: number;
  page: number;
}

/**
 * Parse a raw Ticketmaster API event into our structured format
 */
function parseEvent(raw: any): TicketmasterEvent {
  const venue = raw._embedded?.venues?.[0];
  
  return {
    discoveryId: raw.id,
    name: raw.name,
    date: raw.dates?.start?.localDate || "",
    time: raw.dates?.start?.localTime || undefined,
    dateTime: raw.dates?.start?.dateTime || undefined,
    timezone: raw.dates?.timezone || undefined,
    status: raw.dates?.status?.code || undefined,
    venue: venue ? {
      id: venue.id,
      name: venue.name,
      city: venue.city?.name || "",
      state: venue.state?.name || "",
      stateCode: venue.state?.stateCode || "",
      country: venue.country?.name || "",
      countryCode: venue.country?.countryCode || "",
      address: venue.address?.line1 || undefined,
      postalCode: venue.postalCode || undefined,
      timezone: venue.timezone || undefined,
      location: venue.location ? {
        latitude: venue.location.latitude,
        longitude: venue.location.longitude,
      } : undefined,
    } : null,
    images: (raw.images || []).map((img: any) => ({
      url: img.url,
      width: img.width,
      height: img.height,
      ratio: img.ratio,
    })),
    url: raw.url || undefined,
    priceRanges: raw.priceRanges?.map((pr: any) => ({
      type: pr.type,
      currency: pr.currency,
      min: pr.min,
      max: pr.max,
    })) || undefined,
    classifications: raw.classifications?.map((c: any) => ({
      segment: c.segment ? { name: c.segment.name } : undefined,
      genre: c.genre ? { name: c.genre.name } : undefined,
      subGenre: c.subGenre ? { name: c.subGenre.name } : undefined,
    })) || undefined,
  };
}

/**
 * Search for events using artist name, venue, and/or date
 */
export async function searchEvents(params: {
  keyword?: string;
  artistName?: string;
  venue?: string;
  city?: string;
  stateCode?: string;
  startDate?: string; // Format: YYYY-MM-DD
  endDate?: string;   // Format: YYYY-MM-DD
  size?: number;
}): Promise<SearchResult> {
  const queryParams = new URLSearchParams();
  queryParams.set("apikey", API_KEY);
  queryParams.set("size", String(params.size || 10));
  queryParams.set("sort", "date,asc");
  
  // Build keyword from artist name or use provided keyword
  if (params.keyword) {
    queryParams.set("keyword", params.keyword);
  } else if (params.artistName) {
    queryParams.set("keyword", params.artistName);
  }
  
  // Add venue filter if provided
  if (params.venue) {
    // Venue search is added to keyword for better matching
    const currentKeyword = queryParams.get("keyword") || "";
    if (currentKeyword) {
      queryParams.set("keyword", `${currentKeyword} ${params.venue}`);
    } else {
      queryParams.set("keyword", params.venue);
    }
  }
  
  // Add location filters
  if (params.city) {
    queryParams.set("city", params.city);
  }
  if (params.stateCode) {
    queryParams.set("stateCode", params.stateCode);
  }
  
  // Add date range filters
  if (params.startDate) {
    queryParams.set("startDateTime", `${params.startDate}T00:00:00Z`);
  }
  if (params.endDate) {
    queryParams.set("endDateTime", `${params.endDate}T23:59:59Z`);
  }
  
  const url = `${BASE_URL}/events.json?${queryParams}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ticketmaster API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Handle empty results
    if (!data._embedded?.events) {
      return {
        events: [],
        totalElements: 0,
        totalPages: 0,
        page: 0,
      };
    }
    
    return {
      events: data._embedded.events.map(parseEvent),
      totalElements: data.page?.totalElements || 0,
      totalPages: data.page?.totalPages || 0,
      page: data.page?.number || 0,
    };
  } catch (error) {
    console.error("Ticketmaster search error:", error);
    throw error;
  }
}

/**
 * Get detailed event information by Discovery API ID
 */
export async function getEventDetails(discoveryId: string): Promise<TicketmasterEvent | null> {
  const url = `${BASE_URL}/events/${discoveryId}.json?apikey=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ticketmaster API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    return parseEvent(data);
  } catch (error) {
    console.error("Ticketmaster event details error:", error);
    throw error;
  }
}

/**
 * Find the best matching event based on search criteria
 * Attempts to match by artist name, venue, and date
 */
export async function findMatchingEvent(params: {
  artistName: string;
  venue?: string;
  date?: string; // Format: YYYY-MM-DD or any parseable date string
}): Promise<TicketmasterEvent | null> {
  // First, search with all available criteria
  const searchParams: Parameters<typeof searchEvents>[0] = {
    artistName: params.artistName,
    size: 20,
  };
  
  // Add date range if provided (search within +/- 1 day to account for timezone issues)
  if (params.date) {
    try {
      const eventDate = new Date(params.date);
      const dayBefore = new Date(eventDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(eventDate);
      dayAfter.setDate(dayAfter.getDate() + 1);
      
      searchParams.startDate = dayBefore.toISOString().split("T")[0];
      searchParams.endDate = dayAfter.toISOString().split("T")[0];
    } catch (e) {
      // If date parsing fails, proceed without date filter
      console.warn("Could not parse date:", params.date);
    }
  }
  
  const results = await searchEvents(searchParams);
  
  if (results.events.length === 0) {
    // Try again without date filter if no results
    if (params.date) {
      const fallbackResults = await searchEvents({
        artistName: params.artistName,
        size: 20,
      });
      
      if (fallbackResults.events.length === 0) {
        return null;
      }
      
      return findBestMatch(fallbackResults.events, params);
    }
    return null;
  }
  
  return findBestMatch(results.events, params);
}

/**
 * Find the best matching event from a list based on venue and date
 */
function findBestMatch(
  events: TicketmasterEvent[],
  criteria: { artistName: string; venue?: string; date?: string }
): TicketmasterEvent | null {
  if (events.length === 0) return null;
  if (events.length === 1) return events[0];
  
  // Score each event based on how well it matches
  const scored = events.map(event => {
    let score = 0;
    
    // Name match (case insensitive)
    if (event.name.toLowerCase().includes(criteria.artistName.toLowerCase())) {
      score += 10;
    }
    
    // Venue match
    if (criteria.venue && event.venue) {
      const venueNorm = criteria.venue.toLowerCase().replace(/[^a-z0-9]/g, "");
      const eventVenueNorm = event.venue.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      
      if (eventVenueNorm.includes(venueNorm) || venueNorm.includes(eventVenueNorm)) {
        score += 20;
      }
    }
    
    // Date match
    if (criteria.date && event.date) {
      try {
        const targetDate = new Date(criteria.date).toISOString().split("T")[0];
        if (event.date === targetDate) {
          score += 30;
        }
      } catch (e) {
        // Date parsing failed, skip
      }
    }
    
    return { event, score };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored[0].event;
}
