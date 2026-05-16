import type { DateRange as DayPickerDateRange } from 'react-day-picker';
import type { IsoRange } from './period';

export type CompletedDateRange = {
  from: Date;
  to: Date;
};

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Returns true when DayPicker has both range endpoints selected. */
export function isCompletedDateRange(
  range: DayPickerDateRange | undefined,
): range is CompletedDateRange {
  return Boolean(range?.from && range.to);
}

/** Sorts a completed date range by calendar time and clones both endpoints. */
export function normalizeCompletedDateRange(
  range: CompletedDateRange,
): CompletedDateRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  return from.getTime() <= to.getTime() ? { from, to } : { from: to, to: from };
}

/** Converts a completed DayPicker range into inclusive ISO session bounds. */
export function dateRangeToIsoRange(
  range: DayPickerDateRange | undefined,
): IsoRange | null {
  if (!isCompletedDateRange(range)) return null;
  const { from, to } = normalizeCompletedDateRange(range);
  return {
    from: new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
      0,
      0,
      0,
      0,
    ).toISOString(),
    to: new Date(
      to.getFullYear(),
      to.getMonth(),
      to.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString(),
  };
}

/** Formats a date range for the Range trigger and popover footer. */
export function formatDateRangeLabel(
  range: DayPickerDateRange | undefined,
): string {
  if (!range?.from) return 'Range';
  if (!range.to) return `${SHORT_DATE.format(range.from)} - ...`;

  const { from, to } = normalizeCompletedDateRange({
    from: range.from,
    to: range.to,
  });
  const crossesYear = from.getFullYear() !== to.getFullYear();
  const formatter = crossesYear ? SHORT_DATE_WITH_YEAR : SHORT_DATE;
  return `${formatter.format(from)} - ${formatter.format(to)}`;
}
