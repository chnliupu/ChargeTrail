import { apiGet } from './client';

export type Session = {
  id: string;
  userId: string;
  connectorId: string | null;
  provider: string | null;
  providerSessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  powerKwh: number;
  durationSeconds: number;
  price: number;
  pricePerHour: number | null;
  pricePerKwh: number | null;
  currency: string | null;
  lat: number | null;
  lon: number | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  country: string | null;
  deviceName: string | null;
  deviceId: number | null;
  vehicleId: number | null;
};

export type SessionsPagination = {
  limit: number;
  offset: number;
  count: number;
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type SessionsResponse = {
  ok: boolean;
  sessions: Session[];
  pagination: SessionsPagination;
};

export type DateRange = {
  /** ISO-8601 timestamp (inclusive lower bound on `startedAt`). */
  from: string;
  /** ISO-8601 timestamp (inclusive upper bound on `startedAt`). */
  to: string;
};

export type SessionsParams = {
  limit?: number;
  offset?: number;
  connectorIds?: string[];
  /**
   * Inclusive bounds on session `startedAt`. Serialized as the backend's
   * `dateRange=<fromISO>,<toISO>` query parameter.
   */
  dateRange?: DateRange;
};

export function fetchSessions(
  params: SessionsParams = {},
): Promise<SessionsResponse> {
  const dateRange = params.dateRange
    ? `${params.dateRange.from},${params.dateRange.to}`
    : undefined;
  return apiGet<SessionsResponse>('/api/v1/sessions', {
    limit: params.limit,
    offset: params.offset,
    connectorIds: params.connectorIds,
    dateRange,
  });
}

/** Backend cap; matches `MAX_LIMIT` in `backend/src/schemas/sessions.ts`. */
export const SESSIONS_PAGE_SIZE = 200;

export type FetchAllSessionsResult = {
  sessions: Session[];
  /** True when the row cap (`maxRows`) was reached before pagination ended. */
  truncated: boolean;
};

/**
 * Fetch every session matching `params` by walking pagination pages, stopping
 * either when the backend reports `hasMore=false` or when `maxRows` is hit.
 */
export async function fetchAllSessions(
  params: SessionsParams = {},
  maxRows = 5000,
): Promise<FetchAllSessionsResult> {
  const all: Session[] = [];
  let offset = 0;
  // Hard cap on the number of pages so a misbehaving server can't cause an
  // unbounded loop.
  const maxPages = Math.ceil(maxRows / SESSIONS_PAGE_SIZE) + 1;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await fetchSessions({
      ...params,
      limit: SESSIONS_PAGE_SIZE,
      offset,
    });
    all.push(...res.sessions);
    if (all.length >= maxRows) {
      return {
        sessions: all.slice(0, maxRows),
        truncated: res.pagination.hasMore || all.length > maxRows,
      };
    }
    if (!res.pagination.hasMore || res.pagination.nextOffset == null) {
      return { sessions: all, truncated: false };
    }
    offset = res.pagination.nextOffset;
  }
  return { sessions: all, truncated: true };
}
