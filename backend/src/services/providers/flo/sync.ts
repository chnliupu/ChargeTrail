import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../../db/index.js';
import { chargeSessions, connector } from '../../db/schema.js';
import { log } from '../../logger/index.js';
import type { ChargeSyncFailure, ChargeSyncOutcome } from '../types.js';
import { fetchSessionHistoryPage, FLO_ORIGIN, type FloToken } from './auth.js';
import { parseFloSessionHistoryXml, type FloChargingSession } from './models/sessions.js';

export const FLO_SESSION_HISTORY_XML_URL = `${FLO_ORIGIN}/SessionHistory/SessionHistoryXML`;
const FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

function buildXmlHeaders(token: FloToken): Record<string, string> {
  return {
    Accept: 'application/xml,text/xml,*/*;q=0.8',
    'Accept-Language': 'en,en-US;q=0.9',
    Cookie: token.Cookie,
    Referer: `${FLO_ORIGIN}/SessionHistory`,
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
 * Format a timestamp (ms) as `YYYY-MM-DD` in UTC, the format FLO expects
 * for the `DateRange.From` / `DateRange.To` query parameters.
 */
function formatYmd(ms: number): string {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildSessionHistoryXmlUrl(
  fromMs: number,
  toMs: number,
  requestVerificationToken: string,
): string {
  const params = new URLSearchParams({
    'DateRange.From': formatYmd(fromMs),
    'DateRange.To': formatYmd(toMs),
    SelectedDevice: '',
    __RequestVerificationToken: requestVerificationToken,
  });
  return `${FLO_SESSION_HISTORY_XML_URL}?${params.toString()}`;
}

/**
 * Fetch the SessionHistoryXML report for the given date range and parse
 * it into `FloChargingSession[]`. Caller supplies the
 * `__RequestVerificationToken` previously extracted from the
 * SessionHistory HTML page.
 */
export async function fetchFloSessionHistoryXml(
  token: FloToken,
  fromMs: number,
  toMs: number,
  requestVerificationToken: string,
): Promise<
  { ok: true; sessions: FloChargingSession[] } | { ok: false; failure: ChargeSyncFailure }
> {
  const url = buildSessionHistoryXmlUrl(fromMs, toMs, requestVerificationToken);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildXmlHeaders(token),
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      {
        fn: 'flo.fetchSessionHistoryXml',
        err: message,
      },
      'flo session history xml request failed',
    );
    return {
      ok: false,
      failure: { kind: 'request-failed', status: null, message },
    };
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    (response.status >= 300 && response.status < 400)
  ) {
    return {
      ok: false,
      failure: { kind: 'unauthorized', status: response.status },
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

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      failure: { kind: 'invalid-response', status: response.status, message },
    };
  }

  const parsed = parseFloSessionHistoryXml(body);
  if (!parsed) {
    log.warn(
      {
        fn: 'flo.fetchSessionHistoryXml',
        status: response.status,
      },
      'flo returned unexpected session history xml',
    );
    return {
      ok: false,
      failure: {
        kind: 'invalid-response',
        status: response.status,
        message: 'session history xml did not match expected format',
      },
    };
  }

  return { ok: true, sessions: parsed.sessions };
}

/**
 * Insert parsed FLO charging sessions for a connector and owning user.
 * Idempotent: the unique `(connectorId, providerSessionId)` index combined
 * with `onConflictDoNothing()` ensures repeated syncs only insert new rows.
 */
export function persistFloSessions(
  db: AppDb,
  userId: string,
  connectorId: string,
  sessions: FloChargingSession[],
): { inserted: number } {
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
          // FLO doesn't break out per-hour / per-kWh rates; derive them
          // from the total price divided by duration / energy. Guard
          // against zero denominators (e.g. failed/empty sessions).
          pricePerHour:
            session.durationSeconds > 0 ? session.price / (session.durationSeconds / 3600) : null,
          pricePerKwh: session.powerKwh > 0 ? session.price / session.powerKwh : null,
          currency: session.currency,
          lat: null,
          lon: null,
          address1: null,
          city: null,
          state: null,
          zipcode: null,
          country: null,
          deviceName: session.stationName,
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
  return { inserted };
}

/**
 * Sync FLO session history for a connector. Two-step:
 *   1. GET /SessionHistory to confirm auth and extract __RequestVerificationToken
 *   2. GET /SessionHistory/SessionHistoryXML?DateRange.From=...&DateRange.To=today&__RequestVerificationToken=...
 *
 * `laterThan` (Unix-ms) caps the start of the window; defaults to 90 days
 * ago. The end of the window is "today" (server UTC date). The `laterThan`
 * value is also applied as a post-fetch filter in case FLO's date filtering
 * is inclusive of partial days.
 */
export async function syncFloConnector(
  db: AppDb,
  connectorId: string,
  token: FloToken,
  laterThan?: number,
): Promise<ChargeSyncOutcome> {
  const connectorRow = db
    .select({ userId: connector.userId })
    .from(connector)
    .where(eq(connector.id, connectorId))
    .get();

  if (!connectorRow) {
    return {
      ok: false,
      failure: { kind: 'connector-not-found' },
    };
  }

  const page = await fetchSessionHistoryPage(token, 'flo.sync.fetchPage');
  if (!page.ok) {
    return { ok: false, failure: page.failure };
  }

  const now = Date.now();
  const hasLaterThan = typeof laterThan === 'number' && Number.isFinite(laterThan);
  const fromMs = hasLaterThan ? laterThan : now - DEFAULT_LOOKBACK_MS;

  const xml = await fetchFloSessionHistoryXml(token, fromMs, now, page.requestVerificationToken);
  if (!xml.ok) {
    return { ok: false, failure: xml.failure };
  }

  // Defensive post-fetch filter: drop anything older than the cutoff in
  // case FLO returns extra rows on the date boundary.
  const sessionsToPersist = hasLaterThan
    ? xml.sessions.filter((session) => session.startedAtMs >= laterThan)
    : xml.sessions;
  const skippedByBoundary = hasLaterThan && sessionsToPersist.length < xml.sessions.length;

  const { inserted } = persistFloSessions(db, connectorRow.userId, connectorId, sessionsToPersist);

  log.info(
    {
      fn: 'flo.sync',
      connectorId,
      sessionsFetched: xml.sessions.length,
      inserted,
    },
    'synced flo session history',
  );

  return {
    ok: true,
    result: {
      pagesFetched: 1,
      sessionsFetched: xml.sessions.length,
      sessionsInserted: inserted,
      stoppedReason: skippedByBoundary ? 'older-than-boundary' : null,
    },
  };
}
