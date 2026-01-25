/**
 * Parser for Encore queue output files
 * Format: email<TAB>event_id<TAB>position
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

export function parseQueuesFile(content: string): ParseResult<QueueEntry> {
  const lines = content.trim().split("\n");
  const entries: QueueEntry[] = [];
  const errors: ParseError[] = [];
  let rowIndex = 0;

  let totalPosition = 0;
  let minPosition = Infinity;
  let maxPosition = -Infinity;

  for (const line of lines) {
    rowIndex++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split by tab
    const parts = trimmed.split("\t");
    if (parts.length !== 3) {
      errors.push({
        row: rowIndex,
        message: `Invalid format: expected 3 tab-separated values, got ${parts.length}`,
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
