import { describe, expect, it } from 'vitest';
import { addCalendarDays, calendarDateLabel, calendarMonthDates, calendarMonthLabel, shiftCalendarMonth, startOfCalendarMonth } from '@/lib/booking-calendar';

describe('shop calendar dates', () => {
  it('uses date-only arithmetic across month, year and leap-day boundaries', () => {
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(shiftCalendarMonth('2027-12-01', 1)).toBe('2028-01-01');
    expect(startOfCalendarMonth('2027-01-31')).toBe('2027-01-01');
  });
  it('builds Monday-first cells without changing the selected local date', () => {
    const month = calendarMonthDates('2027-02-01');
    expect(month.cells[0]).toBe('2027-02-01');
    expect(month.last).toBe('2027-02-28');
    expect(month.cells.length % 7).toBe(0);
    expect(calendarMonthLabel('2027-02-01')).toBe('February 2027');
    expect(calendarDateLabel('2027-02-01')).toContain('1 February 2027');
  });
});
