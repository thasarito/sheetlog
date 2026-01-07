import { isValid, parse } from 'date-fns';

/**
 * Parses a date string that may be in various formats:
 * - ISO format with time: "2025-01-06T14:30:00"
 * - Google Sheets formatted: "1/6/2025" or "12/31/2024"
 * - Simple date: "2025-01-06"
 *
 * Returns a valid Date object or falls back to current date.
 */
export function parseDate(dateStr: string): Date {
  // Try ISO format first (from new transactions created in-app)
  if (dateStr.includes('T')) {
    const isoDate = new Date(dateStr);
    if (isValid(isoDate)) {
      return isoDate;
    }
  }

  // Try common formatted date patterns from Google Sheets
  const formats = ['M/d/yyyy HH:mm:ss', 'M/d/yyyy', 'd/M/yyyy', 'yyyy-MM-dd'];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  // Last resort - return current date
  return new Date();
}
