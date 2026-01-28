/**
 * Timezone utilities for converting event dates to venue local time
 * 
 * Maps US and Canadian state/province codes to their primary IANA timezone.
 * Note: Some states span multiple timezones - we use the most populous timezone.
 */

// US State codes to IANA timezone mapping
const US_STATE_TIMEZONES: Record<string, string> = {
  // Eastern Time
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York", // Most of Florida is Eastern
  GA: "America/New_York",
  IN: "America/Indiana/Indianapolis", // Most of Indiana
  KY: "America/New_York", // Eastern Kentucky (Louisville, Lexington)
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/Detroit",
  NC: "America/New_York",
  NH: "America/New_York",
  NJ: "America/New_York",
  NY: "America/New_York",
  OH: "America/New_York",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  VA: "America/New_York",
  VT: "America/New_York",
  WV: "America/New_York",

  // Central Time
  AL: "America/Chicago",
  AR: "America/Chicago",
  IA: "America/Chicago",
  IL: "America/Chicago",
  KS: "America/Chicago", // Most of Kansas
  LA: "America/Chicago",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  ND: "America/Chicago", // Most of ND
  NE: "America/Chicago", // Most of Nebraska
  OK: "America/Chicago",
  SD: "America/Chicago", // Most of SD
  TN: "America/Chicago", // Nashville, Memphis
  TX: "America/Chicago", // Most of Texas
  WI: "America/Chicago",

  // Mountain Time
  AZ: "America/Phoenix", // No DST
  CO: "America/Denver",
  ID: "America/Boise", // Most of Idaho
  MT: "America/Denver",
  NM: "America/Denver",
  UT: "America/Denver",
  WY: "America/Denver",

  // Pacific Time
  CA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",

  // Alaska
  AK: "America/Anchorage",

  // Hawaii
  HI: "Pacific/Honolulu",
};

// Canadian Province codes to IANA timezone mapping
const CA_PROVINCE_TIMEZONES: Record<string, string> = {
  // Atlantic Time
  NB: "America/Moncton",
  NS: "America/Halifax",
  PE: "America/Halifax",
  
  // Newfoundland Time
  NL: "America/St_Johns",

  // Eastern Time
  ON: "America/Toronto",
  QC: "America/Montreal",

  // Central Time
  MB: "America/Winnipeg",
  SK: "America/Regina", // No DST

  // Mountain Time
  AB: "America/Edmonton",

  // Pacific Time
  BC: "America/Vancouver",

  // Northern territories
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
  YT: "America/Whitehorse",
};

/**
 * Get IANA timezone for a US state or Canadian province code
 * @param stateCode Two-letter state/province code (e.g., "CA", "NY", "ON")
 * @returns IANA timezone string or null if not found
 */
export function getTimezoneForState(stateCode: string | null | undefined): string | null {
  if (!stateCode) return null;
  
  const code = stateCode.toUpperCase().trim();
  
  // Check US states first
  if (US_STATE_TIMEZONES[code]) {
    return US_STATE_TIMEZONES[code];
  }
  
  // Check Canadian provinces
  if (CA_PROVINCE_TIMEZONES[code]) {
    return CA_PROVINCE_TIMEZONES[code];
  }
  
  return null;
}

/**
 * Convert a UTC date string to a specific timezone
 * @param utcDateString ISO 8601 date string (e.g., "2026-05-17T00:30:00Z")
 * @param timezone IANA timezone string (e.g., "America/Chicago")
 * @returns Formatted date and time in the target timezone
 */
export function convertToTimezone(
  utcDateString: string,
  timezone: string
): { date: string; time: string; dayOfWeek: string } | null {
  try {
    const dateObj = new Date(utcDateString);
    
    if (isNaN(dateObj.getTime())) {
      return null;
    }

    // Format date in the target timezone
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });

    return {
      date: dateFormatter.format(dateObj),
      time: timeFormatter.format(dateObj),
      dayOfWeek: dayFormatter.format(dateObj),
    };
  } catch (error) {
    console.error(`[Timezone] Failed to convert date to ${timezone}:`, error);
    return null;
  }
}

/**
 * Parse a date string and convert it to the venue's local timezone
 * This is the main function to use when scraping event data
 * 
 * @param utcDateString ISO 8601 date string from Ticketmaster (e.g., "2026-05-17T00:30:00Z")
 * @param venueState Two-letter state/province code (e.g., "TX", "CA", "ON")
 * @returns Formatted date/time in venue's local timezone, or UTC-based fallback
 */
export function convertEventDateToVenueTimezone(
  utcDateString: string,
  venueState: string | null | undefined
): { date: string; time: string; dayOfWeek: string } {
  // Try to get venue timezone from state
  const timezone = getTimezoneForState(venueState);
  
  if (timezone) {
    const converted = convertToTimezone(utcDateString, timezone);
    if (converted) {
      console.log(`[Timezone] Converted ${utcDateString} to ${timezone}: ${converted.date} at ${converted.time}`);
      return converted;
    }
  }
  
  // Fallback: Use the date as-is with default formatting
  // This handles cases where we don't know the timezone
  console.log(`[Timezone] No timezone for state "${venueState}", using default parsing`);
  
  try {
    const dateObj = new Date(utcDateString);
    
    return {
      date: dateObj.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      time: dateObj.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()],
    };
  } catch {
    // Last resort fallback
    return {
      date: utcDateString,
      time: "",
      dayOfWeek: "",
    };
  }
}

/**
 * Get the IANA timezone that Ticketmaster might provide in their API
 * Maps common Ticketmaster timezone formats to IANA names
 */
export function normalizeTimezone(tmTimezone: string | null | undefined): string | null {
  if (!tmTimezone) return null;
  
  // Ticketmaster often provides IANA timezone names directly
  // But sometimes uses abbreviations or non-standard formats
  const normalized = tmTimezone.trim();
  
  // Common Ticketmaster timezone formats
  const TM_TIMEZONE_MAP: Record<string, string> = {
    "America/New_York": "America/New_York",
    "America/Chicago": "America/Chicago",
    "America/Denver": "America/Denver",
    "America/Los_Angeles": "America/Los_Angeles",
    "America/Phoenix": "America/Phoenix",
    "America/Anchorage": "America/Anchorage",
    "Pacific/Honolulu": "Pacific/Honolulu",
    "America/Toronto": "America/Toronto",
    "America/Vancouver": "America/Vancouver",
    // Abbreviation fallbacks (less reliable due to DST ambiguity)
    "EST": "America/New_York",
    "EDT": "America/New_York",
    "CST": "America/Chicago",
    "CDT": "America/Chicago",
    "MST": "America/Denver",
    "MDT": "America/Denver",
    "PST": "America/Los_Angeles",
    "PDT": "America/Los_Angeles",
  };
  
  // Check if it's already a valid IANA timezone (try to use it)
  try {
    Intl.DateTimeFormat(undefined, { timeZone: normalized });
    return normalized;
  } catch {
    // Not a valid IANA timezone, try the map
    return TM_TIMEZONE_MAP[normalized] || null;
  }
}
