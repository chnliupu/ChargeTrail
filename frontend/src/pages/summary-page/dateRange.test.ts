import { describe, expect, it } from 'vitest';
import {
  dateRangeToIsoRange,
  formatDateRangeLabel,
  isCompletedDateRange,
  normalizeCompletedDateRange,
} from './dateRange';

function localDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  return new Date(year, monthIndex, day, hour, minute, second, millisecond);
}

describe('date range helpers', () => {
  it('does not produce an API range until both endpoints are selected', () => {
    const partial = { from: localDate(2026, 3, 1) };
    expect(isCompletedDateRange(undefined)).toBe(false);
    expect(isCompletedDateRange(partial)).toBe(false);
    expect(dateRangeToIsoRange(partial)).toBeNull();
  });

  it('converts a completed range to inclusive local-day ISO bounds', () => {
    expect(
      dateRangeToIsoRange({
        from: localDate(2026, 3, 1, 15, 20),
        to: localDate(2026, 4, 9, 8, 10),
      }),
    ).toEqual({
      from: localDate(2026, 3, 1, 0, 0, 0, 0).toISOString(),
      to: localDate(2026, 4, 9, 23, 59, 59, 999).toISOString(),
    });
  });

  it('supports same-day ranges', () => {
    expect(
      dateRangeToIsoRange({
        from: localDate(2026, 4, 9, 9),
        to: localDate(2026, 4, 9, 9),
      }),
    ).toEqual({
      from: localDate(2026, 4, 9, 0, 0, 0, 0).toISOString(),
      to: localDate(2026, 4, 9, 23, 59, 59, 999).toISOString(),
    });
  });

  it('normalizes reversed completed ranges', () => {
    const normalized = normalizeCompletedDateRange({
      from: localDate(2026, 4, 9),
      to: localDate(2026, 3, 1),
    });
    expect(normalized.from).toEqual(localDate(2026, 3, 1));
    expect(normalized.to).toEqual(localDate(2026, 4, 9));
  });

  it('formats trigger labels for pending and completed selections', () => {
    expect(formatDateRangeLabel(undefined)).toBe('Range');
    expect(formatDateRangeLabel({ from: localDate(2026, 3, 1) })).toBe(
      'Apr 1 - ...',
    );
    expect(
      formatDateRangeLabel({
        from: localDate(2026, 3, 1),
        to: localDate(2026, 4, 9),
      }),
    ).toBe('Apr 1 - May 9');
  });

  it('includes years when the selected range crosses a year boundary', () => {
    expect(
      formatDateRangeLabel({
        from: localDate(2025, 11, 20),
        to: localDate(2026, 0, 3),
      }),
    ).toBe('Dec 20, 2025 - Jan 3, 2026');
  });
});
