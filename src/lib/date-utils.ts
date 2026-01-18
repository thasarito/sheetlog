import { isValid, parse } from 'date-fns';

/**
 * Converts Excel serial number to JavaScript Date.
 * The serial encodes date/time components directly (not a UTC moment).
 * We create a local Date with those exact components so "02:37" stays "02:37".
 */
export function serialNumberToDate(serial: number): Date {
  // Split into date and time parts
  const daysSinceEpoch = Math.floor(serial);
  const timeFraction = serial - daysSinceEpoch;

  // Calculate date from days since Excel epoch (Dec 30, 1899)
  const msPerDay = 86400000;
  const excelEpochMs = Date.UTC(1899, 11, 30);
  const datePart = new Date(excelEpochMs + daysSinceEpoch * msPerDay);

  // Calculate time components from fractional day
  const totalSeconds = Math.round(timeFraction * 86400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Create LOCAL date with these components (no timezone conversion)
  return new Date(
    datePart.getUTCFullYear(),
    datePart.getUTCMonth(),
    datePart.getUTCDate(),
    hours,
    minutes,
    seconds,
  );
}

/**
 * Parses a date that may be:
 * - Excel serial number (from Google Sheets API with SERIAL_NUMBER option)
 * - ISO format string (from local transactions): "2025-01-06T14:30:00"
 * - Formatted string (legacy): "1/6/2025" or "1/6/2025 19:56:00"
 *
 * Returns a valid Date object or falls back to current date.
 */
export function parseDate(dateStr: string | number): Date {
  // Handle serial number from Google Sheets
  if (typeof dateStr === 'number') {
    return serialNumberToDate(dateStr);
  }

  // Try ISO format first (from new transactions created in-app)
  if (dateStr.includes('T')) {
    const isoDate = new Date(dateStr);
    if (isValid(isoDate)) {
      return isoDate;
    }
  }

  // Try common formatted date patterns (legacy support)
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
