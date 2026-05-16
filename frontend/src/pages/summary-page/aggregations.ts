import type { Session } from '../../api/sessions';

export type GroupBy = 'day' | 'week' | 'month';

export type Bucket = {
  key: string;
  kwh: number;
  cost: number;
  count: number;
};

/**
 * Group sessions into time buckets keyed by ISO date / month string. Days use
 * `YYYY-MM-DD`, weeks use the Monday's `YYYY-MM-DD`, months use `YYYY-MM`.
 * Buckets are sorted ascending by key.
 */
export function bucketize(
  sessions: readonly Session[],
  groupBy: GroupBy,
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = bucketKey(d, groupBy);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, kwh: 0, cost: 0, count: 0 };
      map.set(key, bucket);
    }
    bucket.kwh += s.powerKwh;
    bucket.cost += s.price;
    bucket.count += 1;
  }
  return [...map.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local-date `YYYY-MM-DD`. Avoids `toISOString()` so buckets follow the
 * user's timezone instead of UTC. */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function bucketKey(d: Date, groupBy: GroupBy): string {
  if (groupBy === 'day') return localDateKey(d);
  if (groupBy === 'month')
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  // Week: Monday-anchored. JS Sunday=0, so shift by (day+6)%7.
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(monday);
}

export function formatBucketLabel(key: string, groupBy: GroupBy): string {
  if (groupBy === 'month') {
    const [yr, mo] = key.split('-');
    return new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-CA', {
      month: 'short',
      year: '2-digit',
    });
  }
  if (groupBy === 'week') {
    return `W ${new Date(`${key}T12:00:00`).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
    })}`;
  }
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  });
}

export type ConnectorRow = {
  /** Stable key per connector. `null` for sessions with no connector linked. */
  connectorId: string | null;
  /** Provider display name (e.g. "ChargePoint"); falls back to "Unknown". */
  provider: string;
  kwh: number;
  cost: number;
  count: number;
};

/**
 * Group sessions by connector id so that two connectors sharing the same
 * provider remain distinct rows. Sessions without a connector id collapse
 * into a single "no connector" bucket. Rows are sorted by session count desc.
 */
export function byConnector(sessions: readonly Session[]): ConnectorRow[] {
  const map = new Map<string, ConnectorRow>();
  for (const s of sessions) {
    // Use a sentinel string key so `null` connectorIds bucket together while
    // still allowing the row to surface a `null` connectorId to the UI.
    const key = s.connectorId ?? '__no_connector__';
    let row = map.get(key);
    if (!row) {
      row = {
        connectorId: s.connectorId ?? null,
        provider: s.provider ?? 'Unknown',
        kwh: 0,
        cost: 0,
        count: 0,
      };
      map.set(key, row);
    }
    row.kwh += s.powerKwh;
    row.cost += s.price;
    row.count += 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export type LocationRow = {
  key: string;
  city: string;
  address1: string;
  count: number;
  kwh: number;
};

/** Top-N locations by session count. Locations are keyed by `address1, city`. */
export function topLocations(
  sessions: readonly Session[],
  n = 6,
): LocationRow[] {
  const map = new Map<string, LocationRow>();
  for (const s of sessions) {
    // Skip sessions with no location info; "—" is a UI placeholder, not a real
    // location, so it shouldn't be aggregated as its own bucket.
    if (s.city == null && s.address1 == null) continue;
    const city = s.city ?? '—';
    const address1 = s.address1 ?? '—';
    const key = `${address1}, ${city}`;
    let row = map.get(key);
    if (!row) {
      row = { key, city, address1, count: 0, kwh: 0 };
      map.set(key, row);
    }
    row.count += 1;
    row.kwh += s.powerKwh;
  }
  // Sort by session count desc, breaking ties by total kWh desc so the more
  // energy-significant location wins when two locations have equal counts.
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.kwh - a.kwh)
    .slice(0, n);
}

export type Totals = {
  sessions: number;
  kwh: number;
  cost: number;
  avgKwhPerSession: number;
  avgCostPerSession: number;
  blendedPricePerKwh: number;
};

export function totalsOf(sessions: readonly Session[]): Totals {
  const kwh = sessions.reduce((acc, s) => acc + s.powerKwh, 0);
  const cost = sessions.reduce((acc, s) => acc + s.price, 0);
  const n = sessions.length;
  return {
    sessions: n,
    kwh,
    cost,
    avgKwhPerSession: n > 0 ? kwh / n : 0,
    avgCostPerSession: n > 0 ? cost / n : 0,
    blendedPricePerKwh: kwh > 0 ? cost / kwh : 0,
  };
}
