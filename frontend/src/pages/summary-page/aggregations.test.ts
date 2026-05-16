import { describe, expect, it } from 'vitest';
import type { Session } from '../../api/sessions';
import {
  bucketize,
  byConnector,
  formatBucketLabel,
  topLocations,
  totalsOf,
} from './aggregations';

function s(partial: Partial<Session> & Pick<Session, 'startedAt'>): Session {
  const { startedAt, ...rest } = partial;
  return {
    id: partial.id ?? 'sess',
    userId: 'u-1',
    connectorId: null,
    provider: null,
    providerSessionId: null,
    startedAt,
    endedAt: null,
    powerKwh: 0,
    durationSeconds: 0,
    price: 0,
    pricePerHour: null,
    pricePerKwh: null,
    currency: null,
    lat: null,
    lon: null,
    address1: null,
    city: null,
    state: null,
    zipcode: null,
    country: null,
    deviceName: null,
    deviceId: null,
    vehicleId: null,
    ...rest,
  } as Session;
}

/** Build an ISO timestamp that represents the given local-time wall clock,
 * so day/week bucketing tests are independent of the host timezone. */
function localIso(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

describe('aggregations.bucketize', () => {
  it('groups by day using the local-date key', () => {
    const res = bucketize(
      [
        s({
          id: 'a',
          startedAt: localIso(2026, 5, 1, 10),
          powerKwh: 1,
          price: 1,
        }),
        s({
          id: 'b',
          startedAt: localIso(2026, 5, 1, 22),
          powerKwh: 2,
          price: 2,
        }),
        s({
          id: 'c',
          startedAt: localIso(2026, 5, 2, 5),
          powerKwh: 4,
          price: 3,
        }),
      ],
      'day',
    );
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({
      key: '2026-05-01',
      kwh: 3,
      cost: 3,
      count: 2,
    });
    expect(res[1]).toMatchObject({
      key: '2026-05-02',
      kwh: 4,
      cost: 3,
      count: 1,
    });
  });

  it('buckets late-evening UTC timestamps using the local day', () => {
    // Regression: 2026-05-10T00:56:00Z is May 9 in UTC-N timezones. The
    // session detail view shows the local date (May 9 in UTC-4), so the
    // summary chart must agree instead of falling back to the UTC date.
    const res = bucketize(
      [s({ id: 'r', startedAt: '2026-05-10T00:56:00Z', powerKwh: 1 })],
      'day',
    );
    const expected = (() => {
      const d = new Date('2026-05-10T00:56:00Z');
      const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();
    expect(res[0].key).toBe(expected);
  });

  it('groups by week using Monday as the bucket key', () => {
    // 2026-05-06 is a Wednesday → Monday key 2026-05-04 (local time).
    const res = bucketize(
      [
        s({
          id: 'a',
          startedAt: localIso(2026, 5, 6, 9),
          powerKwh: 5,
          price: 1,
        }),
      ],
      'week',
    );
    expect(res[0].key).toBe('2026-05-04');
  });

  it('groups by month using YYYY-MM keys', () => {
    const res = bucketize(
      [
        s({
          id: 'a',
          startedAt: '2026-04-30T20:00:00Z',
          powerKwh: 1,
          price: 1,
        }),
        s({
          id: 'b',
          startedAt: '2026-05-01T20:00:00Z',
          powerKwh: 2,
          price: 2,
        }),
      ],
      'month',
    );
    expect(res.map((b) => b.key)).toEqual(['2026-04', '2026-05']);
  });

  it('returns an empty array for no input', () => {
    expect(bucketize([], 'day')).toEqual([]);
  });

  it('skips sessions with invalid timestamps', () => {
    const res = bucketize(
      [s({ id: 'bad', startedAt: 'not-a-date', powerKwh: 1, price: 1 })],
      'day',
    );
    expect(res).toEqual([]);
  });
});

describe('aggregations.byConnector', () => {
  it('groups by connector id and sorts by descending session count', () => {
    const res = byConnector([
      s({
        id: '1',
        startedAt: '2026-05-01T00:00:00Z',
        connectorId: 'flo-1',
        provider: 'FLO',
        powerKwh: 1,
        price: 1,
      }),
      s({
        id: '2',
        startedAt: '2026-05-01T00:00:00Z',
        connectorId: 'cp-1',
        provider: 'ChargePoint',
        powerKwh: 2,
        price: 3,
      }),
      s({
        id: '3',
        startedAt: '2026-05-02T00:00:00Z',
        connectorId: 'cp-1',
        provider: 'ChargePoint',
        powerKwh: 4,
        price: 2,
      }),
    ]);
    expect(res[0]).toMatchObject({
      connectorId: 'cp-1',
      provider: 'ChargePoint',
      count: 2,
      kwh: 6,
      cost: 5,
    });
    expect(res[1]).toMatchObject({
      connectorId: 'flo-1',
      provider: 'FLO',
      count: 1,
    });
  });

  it('keeps connectors with the same provider as separate rows', () => {
    const res = byConnector([
      s({
        id: '1',
        startedAt: '2026-05-01T00:00:00Z',
        connectorId: 'cp-a',
        provider: 'ChargePoint',
        powerKwh: 1,
      }),
      s({
        id: '2',
        startedAt: '2026-05-02T00:00:00Z',
        connectorId: 'cp-b',
        provider: 'ChargePoint',
        powerKwh: 2,
      }),
    ]);
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.connectorId).sort()).toEqual(['cp-a', 'cp-b']);
  });

  it('labels missing providers as "Unknown" and exposes a null connectorId', () => {
    const res = byConnector([
      s({
        id: '1',
        startedAt: '2026-05-01T00:00:00Z',
        connectorId: null,
        provider: null,
        powerKwh: 1,
        price: 1,
      }),
    ]);
    expect(res[0].provider).toBe('Unknown');
    expect(res[0].connectorId).toBeNull();
  });
});

describe('aggregations.topLocations', () => {
  it('returns the top-N locations sorted by session count', () => {
    const sessions = [
      s({
        id: '1',
        startedAt: '2026-05-01T00:00:00Z',
        address1: '1 A St',
        city: 'X',
        powerKwh: 1,
      }),
      s({
        id: '2',
        startedAt: '2026-05-02T00:00:00Z',
        address1: '1 A St',
        city: 'X',
        powerKwh: 2,
      }),
      s({
        id: '3',
        startedAt: '2026-05-03T00:00:00Z',
        address1: '2 B St',
        city: 'Y',
        powerKwh: 3,
      }),
    ];
    const res = topLocations(sessions, 2);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({
      address1: '1 A St',
      city: 'X',
      count: 2,
      kwh: 3,
    });
    expect(res[1]).toMatchObject({ address1: '2 B St', city: 'Y', count: 1 });
  });

  it('returns an empty array for no input', () => {
    expect(topLocations([])).toEqual([]);
  });

  it('breaks ties on session count by total kWh desc', () => {
    const sessions = [
      s({
        id: '1',
        startedAt: '2026-05-01T00:00:00Z',
        address1: '1 A St',
        city: 'X',
        powerKwh: 2,
      }),
      s({
        id: '2',
        startedAt: '2026-05-02T00:00:00Z',
        address1: '2 B St',
        city: 'Y',
        powerKwh: 10,
      }),
    ];
    const res = topLocations(sessions);
    expect(res).toHaveLength(2);
    // Both have count=1; the one with higher kWh should come first.
    expect(res[0]).toMatchObject({ address1: '2 B St', kwh: 10 });
    expect(res[1]).toMatchObject({ address1: '1 A St', kwh: 2 });
  });

  it('skips sessions with no location info instead of bucketing them under the placeholder', () => {
    const sessions = [
      s({
        id: '1',
        startedAt: '2026-05-01T00:00:00Z',
        address1: '1 A St',
        city: 'X',
        powerKwh: 1,
      }),
      // No address1 and no city — should be skipped, not aggregated as "—, —".
      s({
        id: '2',
        startedAt: '2026-05-02T00:00:00Z',
        address1: null,
        city: null,
        powerKwh: 5,
      }),
      s({
        id: '3',
        startedAt: '2026-05-03T00:00:00Z',
        address1: null,
        city: null,
        powerKwh: 7,
      }),
    ];
    const res = topLocations(sessions);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ address1: '1 A St', city: 'X', count: 1 });
    expect(res.some((r) => r.key.includes('—'))).toBe(false);
  });
});

describe('aggregations.totalsOf', () => {
  it('computes totals and averages, handling empty input safely', () => {
    expect(totalsOf([])).toMatchObject({
      sessions: 0,
      kwh: 0,
      cost: 0,
      avgKwhPerSession: 0,
      avgCostPerSession: 0,
      blendedPricePerKwh: 0,
    });
    const res = totalsOf([
      s({ id: '1', startedAt: '2026-05-01T00:00:00Z', powerKwh: 10, price: 5 }),
      s({
        id: '2',
        startedAt: '2026-05-02T00:00:00Z',
        powerKwh: 30,
        price: 15,
      }),
    ]);
    expect(res.kwh).toBe(40);
    expect(res.cost).toBe(20);
    expect(res.avgKwhPerSession).toBe(20);
    expect(res.blendedPricePerKwh).toBe(0.5);
  });
});

describe('formatBucketLabel', () => {
  it('formats day, week, and month labels', () => {
    expect(formatBucketLabel('2026-05-01', 'day')).toMatch(/May/);
    expect(formatBucketLabel('2026-05-04', 'week')).toMatch(/^W /);
    expect(formatBucketLabel('2026-05', 'month')).toMatch(/May/);
  });
});
