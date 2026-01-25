/**
 * Shared types for all parsers
 */

export interface ParseError {
  line: number;
  message: string;
  raw?: string;
}

export interface ParseResult<T> {
  success: boolean;
  entries: T[];
  errors: ParseError[];
  stats: {
    total: number;
    parsed: number;
    skipped: number;
  };
}
