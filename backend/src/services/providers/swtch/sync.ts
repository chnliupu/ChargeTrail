import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../../db/index.js';
import { chargeSessions, connector } from '../../db/schema.js';
import { log } from '../../logger/index.js';
import type { SwtchToken } from './auth.js';
import { SWTCH_ACTIVITIES_URL } from './auth.js';
import { parseSwtchActivitiesHtml, type SwtchChargingSession } from './models/activity.js';
import type { ChargeSyncFailure, ChargeSyncOutcome } from '../types.js';

const FETCH_TIMEOUT_MS = 15_000;

function buildHeaders(token: SwtchToken): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en,en-US;q=0.9',
    Cookie: token.Cookie,
    Referer: SWTCH_ACTIVITIES_URL,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': token['User-Agent'],
  };
}

function isoFromMillis(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Fetch and parse the SWTCH activities page once.
 */
export async function fetchSwtchActivities(token: SwtchToken): Promise<
  | {
      ok: true;
      sessions: SwtchChargingSession[];
    }
  | {
      ok: false;
      failure: ChargeSyncFailure;
    }
> {
  let response: Response;
  try {
    response = await fetch(SWTCH_ACTIVITIES_URL, {
      method: 'GET',
      headers: buildHeaders(token),
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      failure: {
        kind: 'request-failed',
        status: null,
        message,
      },
    };
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    (response.status >= 300 && response.status < 400)
  ) {
    return {
      ok: false,
      failure: {
        kind: 'unauthorized',
        status: response.status,
      },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        kind: 'request-failed',
        status: response.status,
        message: `upstream returned ${response.status}`,
      },
    };
  }

  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      failure: {
        kind: 'invalid-response',
        status: response.status,
        message,
      },
    };
  }

  const parsed = parseSwtchActivitiesHtml(responseBody);
  if (!parsed) {
    log.warn(
      {
        fn: 'swtch.fetchActivities',
        status: response.status,
        responseBody,
      },
      'swtch returned unexpected activities HTML',
    );
    return {
      ok: false,
      failure: {
        kind: 'invalid-response',
        status: response.status,
        message: 'activities page did not contain completed transactions section',
      },
    };
  }

  return {
    ok: true,
    sessions: parsed.sessions,
  };
}

/**
 * Insert parsed SWTCH charging sessions for a connector and owning user.
 */
export function persistSwtchSessions(
  db: AppDb,
  userId: string,
  connectorId: string,
  sessions: SwtchChargingSession[],
): {
  inserted: number;
} {
  let inserted = 0;
  db.transaction((tx) => {
    for (const session of sessions) {
      const result = tx
        .insert(chargeSessions)
        .values({
          id: randomUUID(),
          userId,
          connectorId,
          providerSessionId: session.providerSessionId,
          startedAt: isoFromMillis(session.startedAtMs),
          endedAt: isoFromMillis(session.endedAtMs),
          powerKwh: session.powerKwh,
          durationSeconds: session.durationSeconds,
          price: session.price,
          pricePerHour: session.pricePerHour,
          pricePerKwh: session.pricePerKwh,
          currency: null,
          lat: null,
          lon: null,
          address1: null,
          city: null,
          state: null,
          zipcode: null,
          country: null,
          deviceName: session.deviceName,
          deviceId: null,
          vehicleId: null,
        })
        .onConflictDoNothing()
        .run();
      if (result.changes > 0) {
        inserted++;
      }
    }
  });

  return {
    inserted,
  };
}

/**
 * Sync SWTCH completed charging activity for a connector from its single page.
 */
export async function syncSwtchConnector(
  db: AppDb,
  connectorId: string,
  token: SwtchToken,
  laterThan?: number,
): Promise<ChargeSyncOutcome> {
  const connectorRow = db
    .select({
      userId: connector.userId,
    })
    .from(connector)
    .where(eq(connector.id, connectorId))
    .get();

  if (!connectorRow) {
    return {
      ok: false,
      failure: {
        kind: 'connector-not-found',
      },
    };
  }

  const page = await fetchSwtchActivities(token);
  if (!page.ok) {
    return {
      ok: false,
      failure: page.failure,
    };
  }

  const hasLaterThan = typeof laterThan === 'number' && Number.isFinite(laterThan);
  const sessionsToPersist = hasLaterThan
    ? page.sessions.filter((session) => session.startedAtMs >= laterThan)
    : page.sessions;
  const skippedByBoundary = hasLaterThan && sessionsToPersist.length < page.sessions.length;
  const { inserted } = persistSwtchSessions(
    db,
    connectorRow.userId,
    connectorId,
    sessionsToPersist,
  );

  log.info(
    {
      fn: 'swtch.sync',
      connectorId,
      sessionsFetched: page.sessions.length,
      inserted,
    },
    'synced activities page',
  );

  return {
    ok: true,
    result: {
      pagesFetched: 1,
      sessionsFetched: page.sessions.length,
      sessionsInserted: inserted,
      stoppedReason: skippedByBoundary ? 'older-than-boundary' : null,
    },
  };
}
