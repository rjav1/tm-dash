/**
 * Parser for Encore queue output files
 * Supports both tab-separated and comma-separated (CSV) formats:
 *   - Tab-separated: email<TAB>event_id<TAB>position
 *   - CSV: email,event_id,position
 */

export interface QueueEntry {
  email: string;
  eventId: string;
  position: number;
}

export interface ParseError {
  row: number;
  message: string;
  rawData?: string;
}

export interface ParseResult<T> {
  data: T[];
  errors: ParseError[];
  stats: {
    total: number;
    parsed: number;
    errored: number;
    avgPosition?: number;
    minPosition?: number;
    maxPosition?: number;
  };
}

/**
 * Detect the delimiter used in the file (tab or comma)
 * Checks the first non-empty line for tabs vs commas
 */
function detectDelimiter(content: string): string {
  const lines = content.trim().split("\n");
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip header rows that might contain "email" or similar
    const lowerLine = trimmed.toLowerCase();
    if (lowerLine.startsWith("email") || lowerLine.startsWith("#")) {
      // Still use this line for delimiter detection
      const hasTab = trimmed.includes("\t");
      const hasComma = trimmed.includes(",");
      
      if (hasTab) return "\t";
      if (hasComma) return ",";
    }
    
    // Check for delimiters in data lines
    const tabCount = (trimmed.match(/\t/g) || []).length;
    const commaCount = (trimmed.match(/,/g) || []).length;
    
    // If we have exactly 2 tabs, use tab (expected for 3 columns)
    if (tabCount === 2) return "\t";
    // If we have exactly 2 commas, use comma
    if (commaCount === 2) return ",";
    // If we have tabs but not the right amount, still prefer tab
    if (tabCount > 0) return "\t";
    // Otherwise use comma if present
    if (commaCount > 0) return ",";
  }
  
  // Default to tab
  return "\t";
}

export function parseQueuesFile(content: string): ParseResult<QueueEntry> {
  const lines = content.trim().split("\n");
  const entries: QueueEntry[] = [];
  const errors: ParseError[] = [];
  let rowIndex = 0;

  let totalPosition = 0;
  let minPosition = Infinity;
  let maxPosition = -Infinity;

  // Auto-detect delimiter (tab or comma)
  const delimiter = detectDelimiter(content);
  const delimiterName = delimiter === "\t" ? "tab" : "comma";

  for (const line of lines) {
    rowIndex++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header row if present (common in CSV files)
    if (rowIndex === 1) {
      const lowerLine = trimmed.toLowerCase();
      if (lowerLine.startsWith("email") || lowerLine.includes("event") || lowerLine.includes("position")) {
        // This looks like a header row, skip it
        continue;
      }
    }

    // Split by detected delimiter
    const parts = trimmed.split(delimiter);
    if (parts.length !== 3) {
      errors.push({
        row: rowIndex,
        message: `Invalid format: expected 3 ${delimiterName}-separated values, got ${parts.length}`,
        rawData: trimmed,
      });
      continue;
    }

    const [email, eventId, positionStr] = parts;
    const position = parseInt(positionStr, 10);

    if (!email || !email.includes("@")) {
      errors.push({
        row: rowIndex,
        message: `Invalid email: ${email}`,
        rawData: trimmed,
      });
      continue;
    }

    if (!eventId) {
      errors.push({
        row: rowIndex,
        message: "Missing event ID",
        rawData: trimmed,
      });
      continue;
    }

    if (isNaN(position) || position < 0) {
      errors.push({
        row: rowIndex,
        message: `Invalid position: ${positionStr}`,
        rawData: trimmed,
      });
      continue;
    }

    // Track stats
    totalPosition += position;
    minPosition = Math.min(minPosition, position);
    maxPosition = Math.max(maxPosition, position);

    entries.push({
      email: email.trim().toLowerCase(),
      eventId: eventId.trim(),
      position,
    });
  }

  return {
    data: entries,
    errors,
    stats: {
      total: lines.filter(l => l.trim()).length,
      parsed: entries.length,
      errored: errors.length,
      avgPosition: entries.length > 0 ? Math.round(totalPosition / entries.length) : undefined,
      minPosition: entries.length > 0 ? minPosition : undefined,
      maxPosition: entries.length > 0 ? maxPosition : undefined,
    },
  };
}
