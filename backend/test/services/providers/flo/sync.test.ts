import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { setupTestDb, type TestDb } from '../../../helpers/db.js';
import { chargeSessions, connector, user } from '../../../../src/services/db/schema.js';

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
  persistFloSessions,
  syncFloConnector,
} from '../../../../src/services/providers/flo/sync.js';
import type { FloChargingSession } from '../../../../src/services/providers/flo/models/sessions.js';

const FIXTURES = join(process.cwd(), 'test/services/providers/flo/fixtures');
function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function buildSession(overrides: Partial<FloChargingSession> = {}): FloChargingSession {
  const start = Date.parse('2000-01-01T00:00:00.000Z');
  const end = Date.parse('2000-01-01T01:02:55.000Z');
  return {
    providerSessionId: 'a'.repeat(64),
    cardNumber: 'TEST-CARD-0001',
    parkName: 'Example Charging Site',
    stationName: 'STATION-TEST-001',
    startedAtMs: start,
    endedAtMs: end,
    powerKwh: 5.715,
    durationSeconds: 3775,
    price: 1.23,
    currency: 'CAD',
    ...overrides,
  };
}

function freshDb(): TestDb {
  const { db } = setupTestDb();
  const now = new Date();
  db.insert(user)
    .values({
      id: 'u-flo',
      name: 'Random User',
      email: 'random-user@example.test',
      emailVerified: false,
      username: 'random-user',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(connector)
    .values({
      id: 'c-flo',
      provider: 'flo',
      providerUsername: 'random-provider-user',
      providerPassword: null,
      userId: 'u-flo',
    })
    .run();
  return db;
}

function countChargeSessions(db: TestDb, connectorId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(chargeSessions)
    .where(eq(chargeSessions.connectorId, connectorId))
    .get();
  return row?.count ?? 0;
}

describe('persistFloSessions', () => {
  it('inserts FLO sessions and is idempotent by synthesized id', () => {
    const db = freshDb();
    const session = buildSession({ providerSessionId: 'b'.repeat(64) });

    expect(persistFloSessions(db, 'u-flo', 'c-flo', [session]).inserted).toBe(1);
    expect(persistFloSessions(db, 'u-flo', 'c-flo', [session]).inserted).toBe(0);

    const row = db
      .select({
        userId: chargeSessions.userId,
        providerSessionId: chargeSessions.providerSessionId,
        currency: chargeSessions.currency,
        deviceName: chargeSessions.deviceName,
      })
      .from(chargeSessions)
      .where(eq(chargeSessions.providerSessionId, 'b'.repeat(64)))
      .get();
    expect(row).toEqual({
      userId: 'u-flo',
      providerSessionId: 'b'.repeat(64),
      currency: 'CAD',
      deviceName: session.stationName,
    });
  });
});

describe('syncFloConnector', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    warnMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function htmlResponse(body: string, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      text: async () => body,
    } as unknown as Response;
  }

  it('fetches the HTML page then the XML report and persists sessions', async () => {
    const db = freshDb();
    const html = readFixture('flo-example.html');
    const xml = readFixture('SessionHistory.xml');
    fetchMock.mockResolvedValueOnce(htmlResponse(html));
    fetchMock.mockResolvedValueOnce(htmlResponse(xml));

    const outcome = await syncFloConnector(db, 'c-flo', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.pagesFetched).toBe(1);
    expect(outcome.result.sessionsFetched).toBeGreaterThan(0);
    expect(outcome.result.sessionsInserted).toBe(outcome.result.sessionsFetched);
    expect(outcome.result.stoppedReason).toBeNull();
    expect(countChargeSessions(db, 'c-flo')).toBe(outcome.result.sessionsFetched);

    // Second call: HTML page request including Referer/User-Agent;
    // and the XML URL must include the date range and verification token.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const xmlCall = fetchMock.mock.calls[1];
    expect(typeof xmlCall[0]).toBe('string');
    expect(xmlCall[0]).toContain('SessionHistoryXML');
    expect(xmlCall[0]).toContain('DateRange.From=');
    expect(xmlCall[0]).toContain('DateRange.To=');
    expect(xmlCall[0]).toContain('__RequestVerificationToken=');
  });

  it('treats the public sign-in HTML as unauthorized', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(htmlResponse(readFixture('flo-auth-failed.html')));

    const outcome = await syncFloConnector(db, 'c-flo', {
      Cookie: 'session=expired',
      'User-Agent': 'Random Test Browser',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe('unauthorized');
  });

  it('reports invalid-response when the XML is malformed', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(htmlResponse(readFixture('flo-example.html')));
    fetchMock.mockResolvedValueOnce(htmlResponse('<html>oops</html>'));

    const outcome = await syncFloConnector(db, 'c-flo', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe('invalid-response');
  });

  it('filters older sessions by laterThan and reports older-than-boundary', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(htmlResponse(readFixture('flo-example.html')));
    fetchMock.mockResolvedValueOnce(htmlResponse(readFixture('SessionHistory.xml')));

    // The fixture's earliest row is 2000-01-01; cut off after that.
    const cutoff = Date.parse('2000-01-04T00:00:00.000Z');
    const outcome = await syncFloConnector(
      db,
      'c-flo',
      {
        Cookie: 'session=randomized',
        'User-Agent': 'Random Test Browser',
      },
      cutoff,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.sessionsFetched).toBeGreaterThan(outcome.result.sessionsInserted);
    expect(outcome.result.stoppedReason).toBe('older-than-boundary');
  });

  it('returns connector-not-found for unknown connectors', async () => {
    const db = freshDb();
    const outcome = await syncFloConnector(db, 'no-such-connector', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe('connector-not-found');
  });
});
