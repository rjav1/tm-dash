/**
 * Section to Zone Mapper
 * 
 * Maps ticket section names/numbers to Vivid Seats zone categories.
 * Used for matching purchased tickets to zone-level pricing.
 */

// Standard zone names that match Vivid Seats categories
export const ZONE_NAMES = {
  FLOOR: "Floor Seating",
  LOWER: "Lower Level",
  CLUB: "Club Level",
  UPPER: "Upper Level",
} as const;

export type ZoneName = typeof ZONE_NAMES[keyof typeof ZONE_NAMES];

/**
 * Map a section name/number to a Vivid Seats zone category
 * 
 * @param section - The section from the ticket (e.g., "SEC1", "Floor", "Section 302")
 * @returns The zone name or null if unknown
 * 
 * @example
 * mapSectionToZone("SEC1") // "Floor Seating"
 * mapSectionToZone("Floor A") // "Floor Seating"
 * mapSectionToZone("105") // "Lower Level"
 * mapSectionToZone("Section 302") // "Upper Level"
 * mapSectionToZone("Club 215") // "Club Level"
 */
export function mapSectionToZone(section: string): ZoneName | null {
  if (!section) return null;
  
  // Normalize the section string
  const normalized = section.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const original = section.toUpperCase();
  
  // Floor patterns - explicit floor mentions
  if (/^(FLOOR|FL|FLR|STAGE|PIT|GA|GENERAL)/.test(normalized)) {
    return ZONE_NAMES.FLOOR;
  }
  
  // Floor patterns - small section numbers (SEC1-SEC8 typically floor for arena shows)
  // This is venue-dependent but works for most arena setups
  if (/^SEC[1-8]$/.test(normalized)) {
    return ZONE_NAMES.FLOOR;
  }
  
  // Also check for standalone small numbers (1-8) that might be floor sections
  if (/^[1-8]$/.test(normalized)) {
    return ZONE_NAMES.FLOOR;
  }
  
  // Club level patterns - explicit mention
  if (/CLUB|SUITE|LOGE|BMO|VIP/.test(original)) {
    return ZONE_NAMES.CLUB;
  }
  
  // Extract the numeric portion of the section
  const numMatch = normalized.match(/(\d+)/);
  if (numMatch) {
    const sectionNum = parseInt(numMatch[1]);
    
    // Section number ranges (typical arena layout):
    // 100-level (101-122): Lower Level
    // 200-level (201-234): Club Level
    // 300-level (301-334): Upper Level
    
    if (sectionNum >= 100 && sectionNum < 200) {
      return ZONE_NAMES.LOWER;
    }
    
    if (sectionNum >= 200 && sectionNum < 300) {
      return ZONE_NAMES.CLUB;
    }
    
    if (sectionNum >= 300 && sectionNum < 400) {
      return ZONE_NAMES.UPPER;
    }
    
    // For sections 1-99, try to infer from context
    if (sectionNum >= 1 && sectionNum <= 20) {
      // Could be floor sections in some venues
      // Check for keywords that suggest upper/lower
      if (/UPPER|UP|BALC/.test(original)) {
        return ZONE_NAMES.UPPER;
      }
      if (/LOWER|LOW|ORCH/.test(original)) {
        return ZONE_NAMES.LOWER;
      }
    }
  }
  
  // Keyword-based fallbacks
  if (/UPPER|UP|BALCONY|BALC|MEZZ|NOSE/.test(original)) {
    return ZONE_NAMES.UPPER;
  }
  
  if (/LOWER|LOW|ORCH|ORCHESTRA|MAIN/.test(original)) {
    return ZONE_NAMES.LOWER;
  }
  
  // Unknown section - return null so user can manually select
  return null;
}

/**
 * Get all available zone names
 */
export function getZoneNames(): ZoneName[] {
  return Object.values(ZONE_NAMES);
}

/**
 * Check if a string is a valid zone name
 */
export function isValidZoneName(name: string): name is ZoneName {
  return Object.values(ZONE_NAMES).includes(name as ZoneName);
}
