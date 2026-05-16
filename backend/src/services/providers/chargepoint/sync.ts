import { randomUUID } from 'node:crypto';
import { log } from '../../logger/index.js';
import type { AppDb } from '../../db/index.js';
import { chargeSessions, connector } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ChargePointToken } from './auth.js';
import {
  parseMonthlyChargingActivityResponse,
  type ChargePointChargingSession,
  type ChargePointMonthlyChargingActivityResponse,
} from './models/monthly-activity.js';
import type { ChargeSyncFailure, ChargeSyncOutcome } from '../types.js';

const MONTHLY_CHARGING_ACTIVITY_API_URL = 'https://mc-ca.chargepoint.com/map-prod/v2';
const MAP_APP_ORIGIN = 'https://driver.chargepoint.com/';
const PAGE_SIZE = 20;
const LAST_PAGE_TOKEN = 'last_page';
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_SYNC_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
// Defensive cap so a misbehaving upstream cannot loop forever.
const MAX_PAGES = 200;

function buildHeaders(token: ChargePointToken): Record<string, string> {
  return {
    Accept: '*/*',
    'Accept-Language': 'en-CA,en;q=0.9',
    'Content-Type': 'application/json',
    Cookie: token.Cookie,
    Origin: MAP_APP_ORIGIN,
    Referer: `${MAP_APP_ORIGIN}/`,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': token['User-Agent'],
  };
}

function buildBody(pageOffset?: string): string {
  const payload: Record<string, unknown> = {
    page_size: PAGE_SIZE,
    show_address_for_home_sessions: true,
  };
  if (pageOffset) {
    payload.page_offset = pageOffset;
  }
  return JSON.stringify({
    charging_activity_monthly: payload,
  });
}

/**
 * Fetch a single page of monthly charging activity from ChargePoint.
 * Validates the response shape using the model's type guard before returning.
 */
export async function fetchMonthlyActivityPage(
  token: ChargePointToken,
  pageOffset?: string,
): Promise<
  | {
      ok: true;
      data: ChargePointMonthlyChargingActivityResponse;
    }
  | {
      ok: false;
      failure: ChargeSyncFailure;
    }
> {
  let response: Response;
  try {
    response = await fetch(MONTHLY_CHARGING_ACTIVITY_API_URL, {
      method: 'POST',
      headers: buildHeaders(token),
      body: buildBody(pageOffset),
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

  if (response.status === 401 || response.status === 403) {
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

  let json: unknown;
  try {
    json = JSON.parse(responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      {
        fn: 'chargepoint.fetchMonthlyActivityPage',
        status: response.status,
        pageOffset: pageOffset ?? null,
        responseBody,
      },
      'chargepoint returned non-JSON response body',
    );
    return {
      ok: false,
      failure: {
        kind: 'invalid-response',
        status: response.status,
        message,
      },
    };
  }

  const parsed = parseMonthlyChargingActivityResponse(json);
  if (!parsed) {
    log.warn(
      {
        fn: 'chargepoint.fetchMonthlyActivityPage',
        status: response.status,
        pageOffset: pageOffset ?? null,
        responseBody,
      },
      'chargepoint returned unexpected response payload',
    );
    return {
      ok: false,
      failure: {
        kind: 'invalid-response',
        status: response.status,
        message: 'response body did not match expected schema',
      },
    };
  }

  return {
    ok: true,
    data: parsed,
  };
}

function isoFromMillis(ms: number): string {
  return new Date(ms).toISOString();
}

function pricePerKwh(total: number, kwh: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(kwh) || kwh <= 0) {
    return null;
  }
  return total / kwh;
}

function pricePerHour(total: number, durationSeconds: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  return total / (durationSeconds / 3600);
}

/**
 * Insert a batch of charging sessions for a connector and its owning user.
 * Existing rows (matched by `connectorId` + `providerSessionId`) are left
 * untouched. Returns counts plus a flag indicating whether the entire batch
 * was already present, which is used to short-circuit pagination.
 */
export function persistChargePointSessions(
  db: AppDb,
  userId: string,
  connectorId: string,
  sessions: ChargePointChargingSession[],
): {
  inserted: number;
  allExisting: boolean;
} {
  if (sessions.length === 0) {
    return {
      inserted: 0,
      allExisting: false,
    };
  }

  const rows: (typeof chargeSessions.$inferInsert)[] = sessions.map((s) => {
    const durationSeconds = Math.round((s.charging_time ?? 0) / 1000);
    return {
      id: randomUUID(),
      userId,
      connectorId,
      providerSessionId: s.session_id_string ?? null,
      startedAt: isoFromMillis(s.start_time),
      endedAt: s.end_time === undefined ? null : isoFromMillis(s.end_time),
      powerKwh: s.energy_kwh,
      durationSeconds,
      price: s.total_amount,
      pricePerHour: pricePerHour(s.total_amount, durationSeconds),
      pricePerKwh: pricePerKwh(s.total_amount, s.energy_kwh),
      currency: s.currency_iso_code ?? null,
      lat: s.lat ?? null,
      lon: s.lon ?? null,
      address1: s.address1 ?? null,
      city: s.city ?? null,
      state: s.state_name ?? null,
      zipcode: s.zipcode ?? null,
      country: s.country ?? null,
      deviceName: s.device_name ?? null,
      deviceId: s.device_id ?? null,
      vehicleId: s.vehicle_id ?? null,
    };
  });

  let inserted = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const result = tx.insert(chargeSessions).values(row).onConflictDoNothing().run();
      if (result.changes > 0) {
        inserted++;
      }
    }
  });

  return {
    inserted,
    allExisting: inserted === 0,
  };
}

function flattenSessions(
  data: ChargePointMonthlyChargingActivityResponse,
): ChargePointChargingSession[] {
  return data.charging_activity_monthly.month_info.flatMap((m) => m.sessions);
}

/**
 * Pull all available monthly charging activity pages for a connector,
 * resolving the connector owner once and persisting each page before fetching
 * the next. Stops when the upstream reports the last page, when an entire
 * page is already in the database, or when an empty page is returned.
 */
export async function syncChargePointConnector(
  db: AppDb,
  connectorId: string,
  token: ChargePointToken,
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

  let pageOffset: string | undefined;
  let pagesFetched = 0;
  let sessionsFetched = 0;
  let sessionsInserted = 0;
  const effectiveLaterThan: number =
    typeof laterThan === 'number' && Number.isFinite(laterThan)
      ? laterThan
      : Date.now() - DEFAULT_SYNC_LOOKBACK_MS;

  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchMonthlyActivityPage(token, pageOffset);
    if (!page.ok) {
      return {
        ok: false,
        failure: page.failure,
      };
    }
    pagesFetched++;

    const sessions = flattenSessions(page.data);
    sessionsFetched += sessions.length;

    const { inserted, allExisting } = persistChargePointSessions(
      db,
      connectorRow.userId,
      connectorId,
      sessions,
    );
    sessionsInserted += inserted;

    log.info(
      {
        fn: 'chargepoint.sync',
        connectorId,
        pageOffset: pageOffset ?? null,
        pageSessions: sessions.length,
        inserted,
      },
      'synced page',
    );

    const nextOffset = page.data.charging_activity_monthly.page_offset;

    if (sessions.length === 0) {
      return {
        ok: true,
        result: {
          pagesFetched,
          sessionsFetched,
          sessionsInserted,
          stoppedReason: 'empty-page',
        },
      };
    }

    if (allExisting) {
      return {
        ok: true,
        result: {
          pagesFetched,
          sessionsFetched,
          sessionsInserted,
          stoppedReason: 'all-existing',
        },
      };
    }

    if (sessions.some((session) => session.start_time < effectiveLaterThan)) {
      return {
        ok: true,
        result: {
          pagesFetched,
          sessionsFetched,
          sessionsInserted,
          stoppedReason: 'older-than-boundary',
        },
      };
    }

    if (nextOffset === LAST_PAGE_TOKEN) {
      return {
        ok: true,
        result: {
          pagesFetched,
          sessionsFetched,
          sessionsInserted,
          stoppedReason: 'last-page',
        },
      };
    }

    pageOffset = nextOffset;
  }

  return {
    ok: true,
    result: {
      pagesFetched,
      sessionsFetched,
      sessionsInserted,
      stoppedReason: 'max-pages-reached',
    },
  };
}
