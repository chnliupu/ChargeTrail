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
  persistSwtchSessions,
  syncSwtchConnector,
} from '../../../../src/services/providers/swtch/sync.js';
import type { SwtchChargingSession } from '../../../../src/services/providers/swtch/models/activity.js';

function buildSession(overrides: Partial<SwtchChargingSession> = {}): SwtchChargingSession {
  const start = Date.parse('2026-05-04T04:51:00.000Z');
  const end = Date.parse('2026-05-04T05:07:00.000Z');
  const receiptId = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  return {
    providerSessionId: receiptId,
    deviceName: `CA${Math.floor(Math.random() * 900) + 100}`,
    startedAtMs: start,
    endedAtMs: end,
    powerKwh: 1.657,
    durationSeconds: 960,
    price: 0.55,
    pricePerHour: 2.0625,
    pricePerKwh: 0.55 / 1.657,
    ...overrides,
  };
}

function table(session: SwtchChargingSession): string {
  const start = new Date(session.startedAtMs);
  const end = new Date(session.endedAtMs);
  const period =
    session.providerSessionId === 'older'
      ? '04/01/2026 at 01:00 PM (PDT) to 04/01/2026 at 01:15 PM (PDT)'
      : '05/03/2026 at 09:51 PM (PDT) to 05/03/2026 at 10:07 PM (PDT)';
  void start;
  void end;
  return `
    <table class='table table-my-rentals'>
      <tbody>
        <tr>
          <td>${session.deviceName}</td>
          <td>${period}</td>
          <td>$${session.price.toFixed(2)}</td>
          <td>${session.powerKwh.toFixed(4)} kWh</td>
          <td>${session.providerSessionId}</td>
          <td><a href="/en/v3_transactions/${session.providerSessionId}">View</a></td>
        </tr>
      </tbody>
    </table>
  `;
}

function html(sessions: SwtchChargingSession[]): string {
  return `
    <html>
      <body>
        <h2>Completed Transactions</h2>
        ${sessions.map((session) => table(session)).join('')}
        <h2>Refunded Transactions</h2>
        <div>No refunded transactions</div>
      </body>
    </html>
  `;
}

function freshDb(): TestDb {
  const { db } = setupTestDb();
  const now = new Date();
  db.insert(user)
    .values({
      id: 'u-swtch',
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
      id: 'c-swtch',
      provider: 'swtch',
      providerUsername: 'random-provider-user',
      providerPassword: null,
      userId: 'u-swtch',
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

describe('persistSwtchSessions', () => {
  it('inserts SWTCH sessions and is idempotent by connector receipt id', () => {
    const db = freshDb();
    const session = buildSession({
      providerSessionId: '7654321',
    });

    expect(persistSwtchSessions(db, 'u-swtch', 'c-swtch', [session]).inserted).toBe(1);
    expect(persistSwtchSessions(db, 'u-swtch', 'c-swtch', [session]).inserted).toBe(0);

    const row = db
      .select({
        userId: chargeSessions.userId,
        providerSessionId: chargeSessions.providerSessionId,
        currency: chargeSessions.currency,
        deviceName: chargeSessions.deviceName,
      })
      .from(chargeSessions)
      .where(eq(chargeSessions.providerSessionId, '7654321'))
      .get();
    expect(row).toEqual({
      userId: 'u-swtch',
      providerSessionId: '7654321',
      currency: null,
      deviceName: session.deviceName,
    });
  });
});

describe('syncSwtchConnector', () => {
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

  it('fetches one page and returns a null stoppedReason on normal success', async () => {
    const db = freshDb();
    const sessions = [
      buildSession({
        providerSessionId: '1000001',
      }),
      buildSession({
        providerSessionId: '1000002',
      }),
    ];
    fetchMock.mockResolvedValueOnce(htmlResponse(html(sessions)));

    const outcome = await syncSwtchConnector(db, 'c-swtch', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result).toEqual({
      pagesFetched: 1,
      sessionsFetched: 2,
      sessionsInserted: 2,
      stoppedReason: null,
    });
    expect(countChargeSessions(db, 'c-swtch')).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports fetched total while filtering older sessions by later_than', async () => {
    const db = freshDb();
    const sessions = [
      buildSession({
        providerSessionId: 'older',
      }),
      buildSession({
        providerSessionId: '1000003',
      }),
    ];
    fetchMock.mockResolvedValueOnce(htmlResponse(html(sessions)));

    const outcome = await syncSwtchConnector(
      db,
      'c-swtch',
      {
        Cookie: 'session=randomized',
        'User-Agent': 'Random Test Browser',
      },
      Date.parse('2026-05-01T00:00:00.000Z'),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result).toEqual({
      pagesFetched: 1,
      sessionsFetched: 2,
      sessionsInserted: 1,
      stoppedReason: 'older-than-boundary',
    });
  });

  it('handles an empty completed transactions section', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(htmlResponse(html([])));

    const outcome = await syncSwtchConnector(db, 'c-swtch', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result).toEqual({
      pagesFetched: 1,
      sessionsFetched: 0,
      sessionsInserted: 0,
      stoppedReason: null,
    });
  });

  it('rejects pages without the completed transactions section', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(htmlResponse('<html>No activity</html>'));

    const outcome = await syncSwtchConnector(db, 'c-swtch', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe('invalid-response');
  });

  it('propagates unauthorized and request failures', async () => {
    const db = freshDb();
    fetchMock.mockResolvedValueOnce(htmlResponse('', 302));

    const unauthorized = await syncSwtchConnector(db, 'c-swtch', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(unauthorized.ok).toBe(false);
    if (unauthorized.ok) {
      return;
    }
    expect(unauthorized.failure.kind).toBe('unauthorized');

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const failed = await syncSwtchConnector(db, 'c-swtch', {
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(failed.ok).toBe(false);
    if (failed.ok) {
      return;
    }
    expect(failed.failure.kind).toBe('request-failed');
  });
});
