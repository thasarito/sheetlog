import { isValid } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { parseDate, serialNumberToDate } from './date-utils';

describe('serialNumberToDate', () => {
  it('should convert Excel serial number to Date', () => {
    // Serial 46023 = Jan 1, 2026 00:00:00
    const result = serialNumberToDate(46023);
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('should handle fractional serial numbers (time of day)', () => {
    // 19:56:00 = 71760 seconds = 71760/86400 of a day
    const result = serialNumberToDate(46023 + 71760 / 86400);
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(56);
  });

  it('should parse actual Google Sheets serial numbers', () => {
    // 46023.55972222222 = Jan 1, 2026 13:26:00 (0.55972... * 86400 = 48360 seconds)
    const result = serialNumberToDate(46023.55972222222);
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(13);
    expect(result.getMinutes()).toBe(26);
  });
});

describe('parseDate', () => {
  it('should parse serial number (from Google Sheets)', () => {
    const result = parseDate(46023);
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2026);
  });

  it('should parse ISO format dates with time', () => {
    const result = parseDate('2025-01-06T14:30:00');
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(6);
  });

  it('should parse Google Sheets formatted dates (M/d/yyyy)', () => {
    const result = parseDate('1/6/2025');
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(6);
  });

  it("should NOT throw 'Invalid time value' on formatted strings", () => {
    // This is the bug - formatted strings from Google Sheets
    expect(() => parseDate('1/6/2025')).not.toThrow();
    expect(() => parseDate('12/31/2024')).not.toThrow();
  });

  it('should parse yyyy-MM-dd format', () => {
    const result = parseDate('2025-01-06');
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(6);
  });

  it('should return a valid Date for edge cases', () => {
    const result = parseDate('invalid-date');
    expect(isValid(result)).toBe(true); // Falls back to current date
  });

  it('should parse Google Sheets datetime format (M/d/yyyy HH:mm:ss)', () => {
    const result = parseDate('1/1/2026 19:56:00');
    expect(isValid(result)).toBe(true);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(56);
  });
});
