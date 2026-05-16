import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { setupTestDb, type TestDb } from '../../../helpers/db.js';
import { connector, user } from '../../../../src/services/db/schema.js';

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

vi.mock('../../../../src/services/logger/index.js', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
  },
}));

import {
  persistChargePointSessions,
  syncChargePointConnector,
} from '../../../../src/services/providers/chargepoint/sync.js';
import { chargeSessions } from '../../../../src/services/db/schema.js';
import type { ChargePointChargingSession } from '../../../../src/services/providers/chargepoint/models/monthly-activity.js';

function buildSession(
  overrides: Partial<ChargePointChargingSession> = {},
): ChargePointChargingSession {
  const sessionId = Math.floor(Math.random() * 1_000_000_000) + 1;
  return {
    country: 'Atlantis',
    city: 'Coral Bay',
    purpose: 'PERSONAL',
    power_kw_display: '0.00',
    is_purpose_finalized: true,
    update_period: 8000,
    lon: -71.5 - Math.random(),
    power_kw: 0,
    session_time: 1_000_000,
    has_charging_receipt: true,
    payment_completed: true,
    energy_kwh: 5.5,
    device_name: `RANDOM CAMPUS / BAY ${Math.floor(Math.random() * 99)}`,
    api_flag: false,
    outlet_number: 1,
    state_name: 'Mid Province',
    organization_currency: 'ATL',
    currency_iso_code: 'ATL',
    current_charging: 'done',
    vehicle_id: 99999999,
    lat: 18.3 + Math.random(),
    port_level: 2,
    charging_time: 3_600_000,
    device_id: Math.floor(Math.random() * 100_000_000),
    company_id: 1234,
    is_home_charger: false,
    address1: `${Math.floor(Math.random() * 9999)} Example Way`,
    end_time: 1777167814000,
    energy_kwh_display: '5.5000',
    session_id_string: String(sessionId),
    session_id: sessionId,
    is_mfhs_enabled: false,
    zipcode: '00000',
    last_update_data_timestamp: 1777167814000,
    start_time: 1777160000000,
    payment_type: 'paid',
    total_amount: 1.25,
    company_name: 'Anonymous Op',
    billing_time: 1777167860000,
    start_offset: -25200,
    miles_added: 13.0,
    stop_charge_supported: true,
    ...overrides,
  };
}

function buildPage(sessions: ChargePointChargingSession[], pageOffset: string) {
  return {
    charging_activity_monthly: {
      primary_vehicle: {
        year: 2024,
        model: 'Atlas-E',
        make: 'Northwind',
      },
      month_info: [
        {
          sessions,
          energy_kwh: {
            public: 1,
          },
          cost: {
            public: 1,
            currency_iso_code: 'ATL',
          },
          month: 4,
          year: 2026,
          miles_added: {
            public: 1,
          },
          vehicle_info: {
            '99999999': {
              year: 2024,
              ev_range: 33,
              is_primary_vehicle: true,
              model: 'Atlas-E',
              battery_capacity: 13.8,
              vehicle_id: 99999999,
              make: 'Northwind',
            },
          },
        },
      ],
      page_offset: pageOffset,
    },
  };
}

function freshDb(): TestDb {
  const { db } = setupTestDb();
  const now = new Date();
  db.insert(user)
    .values({
      id: 'u1',
      name: 'u1',
      email: 'u1@local',
      emailVerified: false,
      username: 'u1',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(connector)
    .values({
      id: 'c1',
      provider: 'chargepoint',
      providerUsername: 'u@example.com',
      providerPassword: 'pw',
      userId: 'u1',
    })
    .run();
  return db;
}

function countChargeSessions(db: TestDb, connectorId: string): number {
  const row = db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(chargeSessions)
    .where(eq(chargeSessions.connectorId, connectorId))
    .get();
  return row?.count ?? 0;
}

describe('persistChargePointSessions', () => {
  it('inserts sessions and returns inserted=count', () => {
    const db = freshDb();
    const sessions = [
      buildSession({
        start_time: 1777160000000,
      }),
      buildSession({
        start_time: 1777170000000,
      }),
    ];
    const result = persistChargePointSessions(db, 'u1', 'c1', sessions);
    expect(result.inserted).toBe(2);
    expect(result.allExisting).toBe(false);

    const row = db
      .select({
        userId: chargeSessions.userId,
        providerSessionId: chargeSessions.providerSessionId,
        address1: chargeSessions.address1,
        deviceName: chargeSessions.deviceName,
      })
      .from(chargeSessions)
      .where(eq(chargeSessions.providerSessionId, sessions[0].session_id_string!))
      .get();
    expect(row?.userId).toBe('u1');
    expect(row?.providerSessionId).toBe(sessions[0].session_id_string);
    expect(row?.address1).toBe(sessions[0].address1);
    expect(row?.deviceName).toBe(sessions[0].device_name);
  });

  it('is idempotent on (connectorId, providerSessionId)', () => {
    const db = freshDb();
    const s = buildSession();
    expect(persistChargePointSessions(db, 'u1', 'c1', [s]).inserted).toBe(1);
    const second = persistChargePointSessions(db, 'u1', 'c1', [s]);
    expect(second.inserted).toBe(0);
    expect(second.allExisting).toBe(true);
  });

  it('stores nullable columns as null when optional payload fields are omitted', () => {
    const db = freshDb();
    const session = buildSession({
      session_id_string: undefined,
      end_time: undefined,
      currency_iso_code: undefined,
      lat: undefined,
      lon: undefined,
      address1: undefined,
      city: undefined,
      state_name: undefined,
      zipcode: undefined,
      country: undefined,
      device_name: undefined,
      device_id: undefined,
      vehicle_id: undefined,
    });

    const result = persistChargePointSessions(db, 'u1', 'c1', [session]);
    expect(result.inserted).toBe(1);

    const row = db.select().from(chargeSessions).where(eq(chargeSessions.connectorId, 'c1')).get();

    expect(row?.providerSessionId).toBeNull();
    expect(row?.endedAt).toBeNull();
    expect(row?.currency).toBeNull();
    expect(row?.lat).toBeNull();
    expect(row?.lon).toBeNull();
    expect(row?.address1).toBeNull();
    expect(row?.city).toBeNull();
    expect(row?.state).toBeNull();
    expect(row?.zipcode).toBeNull();
    expect(row?.country).toBeNull();
    expect(row?.deviceName).toBeNull();
    expect(row?.deviceId).toBeNull();
    expect(row?.vehicleId).toBeNull();
  });
});

describe('syncChargePointConnector', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    warnMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200) {
    const serialized = JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      json: async () => body,
      text: async () => serialized,
    } as unknown as Response;
  }

  it('paginates until last_page and inserts all new sessions', async () => {
    const db = freshDb();
    const page1 = buildPage([buildSession(), buildSession()], 'p_2026_3');
    const page2 = buildPage([buildSession()], 'last_page');

    fetchMock.mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2));

    const outcome = await syncChargePointConnector(db, 'c1', {
      Cookie: 'x=1',
      'User-Agent': 'UA',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.pagesFetched).toBe(2);
    expect(outcome.result.sessionsFetched).toBe(3);
    expect(outcome.result.sessionsInserted).toBe(3);
    expect(outcome.result.stoppedReason).toBe('last-page');

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondCallBody.charging_activity_monthly.page_offset).toBe('p_2026_3');
  });

  it('stops early when an entire page is already in the database', async () => {
    const db = freshDb();
    const known = buildSession();
    persistChargePointSessions(db, 'u1', 'c1', [known]);

    const page1 = buildPage([known], 'p_2026_3');
    fetchMock.mockResolvedValueOnce(jsonResponse(page1));

    const outcome = await syncChargePointConnector(db, 'c1', {
      Cookie: 'x=1',
      'User-Agent': 'UA',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.pagesFetched).toBe(1);
    expect(outcome.result.sessionsInserted).toBe(0);
    expect(outcome.result.stoppedReason).toBe('all-existing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops after persisting the current page when a session is older than later_than', async () => {
    const db = freshDb();
    const cutoff = Date.parse('2026-04-01T00:00:00.000Z');
    const page1 = buildPage(
      [
        buildSession({
          session_id_string: '1001',
          session_id: 1001,
          start_time: cutoff + 60_000,
          end_time: cutoff + 120_000,
          billing_time: cutoff + 120_000,
          last_update_data_timestamp: cutoff + 120_000,
        }),
        buildSession({
          session_id_string: '1002',
          session_id: 1002,
          start_time: cutoff - 1,
          end_time: cutoff + 180_000,
          billing_time: cutoff + 180_000,
          last_update_data_timestamp: cutoff + 180_000,
        }),
      ],
      'p_2026_3',
    );

    fetchMock.mockResolvedValueOnce(jsonResponse(page1));

    const outcome = await syncChargePointConnector(
      db,
      'c1',
      {
        Cookie: 'x=1',
        'User-Agent': 'UA',
      },
      cutoff,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.pagesFetched).toBe(1);
    expect(outcome.result.sessionsFetched).toBe(2);
    expect(outcome.result.sessionsInserted).toBe(2);
    expect(outcome.result.stoppedReason).toBe('older-than-boundary');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(countChargeSessions(db, 'c1')).toBe(2);
  });

  it('defaults later_than to 90 days before the current time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'));

    try {
      const db = freshDb();
      const defaultCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const page1 = buildPage(
        [
          buildSession({
            session_id_string: '1003',
            session_id: 1003,
            start_time: defaultCutoff - 1,
            end_time: defaultCutoff + 60_000,
            billing_time: defaultCutoff + 60_000,
            last_update_data_timestamp: defaultCutoff + 60_000,
          }),
        ],
        'p_2026_2',
      );

      fetchMock.mockResolvedValueOnce(jsonResponse(page1));

      const outcome = await syncChargePointConnector(db, 'c1', {
        Cookie: 'x=1',
        'User-Agent': 'UA',
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) {
        return;
      }
      expect(outcome.result.pagesFetched).toBe(1);
      expect(outcome.result.sessionsInserted).toBe(1);
      expect(outcome.result.stoppedReason).toBe('older-than-boundary');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates an unauthorized failure', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));

    const outcome = await syncChargePointConnector(db, 'c1', {
      Cookie: 'x=1',
      'User-Agent': 'UA',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe('unauthorized');
  });

  it('rejects an invalid response body', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        unexpected: true,
      }),
    );

    const outcome = await syncChargePointConnector(db, 'c1', {
      Cookie: 'x=1',
      'User-Agent': 'UA',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe('invalid-response');
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: 'chargepoint.fetchMonthlyActivityPage',
        status: 200,
        pageOffset: null,
        responseBody: JSON.stringify({
          unexpected: true,
        }),
      }),
      'chargepoint returned unexpected response payload',
    );
  });
});
