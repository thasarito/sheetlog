import { isValid } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { parseDate } from './date-utils';

describe('parseDate', () => {
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
