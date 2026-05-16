/**
 * Map a UI period selector to an inclusive ISO-8601 date range bound on
 * session `startedAt`. Returns `null` for the "all-time" option, signaling
 * that no `dateRange` query parameter should be sent to the backend.
 *
 * The range is snapped to local-day boundaries so that re-evaluating the
 * same period within the same calendar day produces a stable cache key for
 * TanStack `useQuery` (avoiding a fresh network call on every minor change
 * to `now`). The end bound is the last millisecond of the current local
 * day, and the start bound is the first millisecond of the day `days` days
 * earlier. This trades sub-day precision for cache stability.
 */
export type Period = '30d' | '90d' | '1y' | 'all';

export type IsoRange = {
  from: string;
  to: string;
};

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

export function periodToRange(
  period: Period,
  now: Date = new Date(),
): IsoRange | null {
  if (period === 'all') return null;
  const days = PERIOD_DAYS[period];
  // End of today (local time): 23:59:59.999.
  const to = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  // Start of the day `days` days ago (local time): 00:00:00.000.
  const from = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - days,
    0,
    0,
    0,
    0,
  );
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
