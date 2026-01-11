import { describe, it, expect } from 'vitest';
import { isoDateStringToDate, doYahrzeit, torahPortion } from './app.js';
import { HDate } from '@hebcal/hdate';

describe('Hebcal MCP Server Functions', () => {
  describe('isoDateStringToDate', () => {
    it('should parse a valid ISO date string', () => {
      const result = isoDateStringToDate('2024-01-15');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January is 0
      expect(result.getDate()).toBe(15);
    });

    it('should parse dates with leading zeros', () => {
      const result = isoDateStringToDate('2024-03-05');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(2); // March is 2
      expect(result.getDate()).toBe(5);
    });

    it('should throw RangeError for invalid date format', () => {
      expect(() => isoDateStringToDate('invalid-date')).toThrow(RangeError);
      expect(() => isoDateStringToDate('2024/01/15')).toThrow(RangeError);
      expect(() => isoDateStringToDate('24-01-15')).toThrow(RangeError);
    });

    it('should throw RangeError for malformed dates', () => {
      expect(() => isoDateStringToDate('not-a-date')).toThrow('Date does not match format YYYY-MM-DD');
    });
  });

  describe('doYahrzeit', () => {
    it('should return an array of yahrzeit dates', () => {
      const date = new Date(2020, 0, 15); // Jan 15, 2020
      const result = doYahrzeit(date, false);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(2); // Should have header rows and data
      expect(result[0]).toContain('Anniversary number');
      expect(result[1]).toContain('----'); // Table separator
    });

    it('should calculate yahrzeit with afterSunset=true', () => {
      const date = new Date(2020, 0, 15);
      const result = doYahrzeit(date, true);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(2);
    });

    it('should include Hebrew year and Gregorian date in output', () => {
      const date = new Date(2020, 0, 15);
      const result = doYahrzeit(date, false);

      // Should have at least one data row with years and dates
      const dataRows = result.slice(2); // Skip header rows
      expect(dataRows.length).toBeGreaterThan(0);
      // Each row should match the markdown table format
      expect(dataRows[0]).toMatch(/\|.*\|.*\|.*\|.*\|.*\|/);
    });
  });

  describe('torahPortion', () => {
    it('should return Torah portion information for a date', () => {
      const date = new Date(2024, 0, 6); // Jan 6, 2024 - a Saturday
      const result = torahPortion(date, false);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('Torah portion:');
      expect(result.some(line => line.includes('Date read:'))).toBe(true);
    });

    it('should handle Israel vs Diaspora differences', () => {
      const date = new Date(2024, 0, 6);
      const diaspora = torahPortion(date, false);
      const israel = torahPortion(date, true);

      expect(Array.isArray(diaspora)).toBe(true);
      expect(Array.isArray(israel)).toBe(true);
      // Both should have content
      expect(diaspora.length).toBeGreaterThan(0);
      expect(israel.length).toBeGreaterThan(0);
    });

    it('should include Hebrew name for regular parsha', () => {
      const date = new Date(2024, 0, 6);
      const result = torahPortion(date, false);

      // Filter out special holiday readings which don't have Hebrew names
      const hasHebrewOrSpecial = result.some(line =>
        line.includes('Name in Hebrew:') || result[0].includes('Rosh')
      );
      expect(hasHebrewOrSpecial).toBe(true);
    });
  });

  describe('Hebrew date conversions', () => {
    it('should convert Gregorian to Hebrew date', () => {
      const date = new Date(2024, 0, 1); // Jan 1, 2024
      const hd = new HDate(date);

      expect(hd.getFullYear()).toBeGreaterThan(5700); // Should be in Hebrew year 5000+
      expect(hd.getMonthName()).toBeTruthy();
      expect(hd.getDate()).toBeGreaterThan(0);
      expect(hd.getDate()).toBeLessThanOrEqual(30);
    });

    it('should handle leap year detection', () => {
      const date = new Date(2024, 0, 1);
      const hd = new HDate(date);

      expect(typeof hd.isLeapYear()).toBe('boolean');
    });
  });
});
