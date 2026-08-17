import { isValid, parse } from "date-fns";

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
  const totalMilliseconds = Math.round(timeFraction * msPerDay);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;

  // Create LOCAL date with these components (no timezone conversion)
  return new Date(
    datePart.getUTCFullYear(),
    datePart.getUTCMonth(),
    datePart.getUTCDate(),
    hours,
    minutes,
    seconds,
    milliseconds
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
export function tryParseDate(dateValue: string | number): Date | null {
  if (typeof dateValue === "number") {
    const serialDate = serialNumberToDate(dateValue);
    return isValid(serialDate) ? serialDate : null;
  }

  if (dateValue.includes("T")) {
    const isoDate = new Date(dateValue);
    if (isValid(isoDate)) {
      return isoDate;
    }
  }

  const formats = ["M/d/yyyy HH:mm:ss", "M/d/yyyy", "d/M/yyyy", "yyyy-MM-dd"];
  for (const dateFormat of formats) {
    const parsed = parse(dateValue, dateFormat, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function parseDate(dateValue: string | number): Date {
  return tryParseDate(dateValue) ?? new Date();
}
