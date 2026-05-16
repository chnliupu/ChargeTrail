import type { AppDb } from '../db/index.js';
import type { BrowserSessionToken } from './browser-token.js';

/**
 * Why a sync stopped before exhausting all upstream pages. Always one of
 * these labels — never an arbitrary string. Used by callers to distinguish
 * "ran to completion" (`'last-page'`, `'empty-page'`) from "stopped early
 * by design" (`'all-existing'`, `'older-than-boundary'`) from "stopped
 * early by safety cap" (`'max-pages-reached'`).
 *
 * Single-page providers (e.g. SWTCH) emit only `'older-than-boundary'` or
 * `null`; the broader vocabulary is reserved for paginated providers.
 *
 * - `'last-page'`        — upstream signaled this was the final page.
 * - `'all-existing'`     — every session in the page was already in the DB.
 * - `'empty-page'`       — upstream returned a page with zero sessions.
 * - `'older-than-boundary'` — at least one session in the page started
 *                            before the `laterThan` cutoff; sync stops
 *                            because earlier pages will only be older still.
 * - `'max-pages-reached'` — defensive cap hit (misbehaving upstream).
 */
export type ChargeSyncStoppedReason =
  | 'last-page'
  | 'all-existing'
  | 'empty-page'
  | 'older-than-boundary'
  | 'max-pages-reached';

/**
 * Successful sync summary. All counters are cumulative across whatever
 * pages the provider's `syncConnector` chose to fetch; callers should not
 * assume any specific page count.
 *
 * - `pagesFetched`     — number of upstream HTTP requests issued. Always >= 1.
 * - `sessionsFetched`  — total sessions parsed across all fetched pages.
 * - `sessionsInserted` — sessions newly written to `chargeSessions`.
 *                       (`sessionsFetched - sessionsInserted` were dedup'd
 *                       against existing rows by the unique key on
 *                       `(connectorId, providerSessionId)`.)
 * - `stoppedReason`    — why the loop terminated, or `null` if the provider
 *                       has no pagination (single-page providers may still
 *                       set this to `'older-than-boundary'` when filtering).
 */
export type ChargeSyncResult = {
  pagesFetched: number;
  sessionsFetched: number;
  sessionsInserted: number;
  stoppedReason: ChargeSyncStoppedReason | null;
};

/**
 * Discriminated union of every way a sync can fail. The route handler
 * switches on `kind` to map to HTTP status; do not introduce new kinds
 * without updating the handler.
 *
 * - `'request-failed'`     — network/timeout, or upstream returned a non-OK
 *                           status that wasn't 401/403. `status` is `null`
 *                           when no response was received (e.g. timeout).
 * - `'invalid-response'`   — upstream returned 2xx but the body was
 *                           unparseable / didn't match expected schema.
 *                           `status` is the HTTP status of that response.
 * - `'connector-not-found'` — the `connectorId` row was deleted between the
 *                            handler's lookup and the sync call.
 * - `'unauthorized'`       — upstream returned 401/403, or (for SWTCH) any
 *                           3xx redirect — both indicate the stored
 *                           browser token is no longer accepted.
 */
export type ChargeSyncFailure =
  | {
      kind: 'request-failed';
      status: number | null;
      message: string;
    }
  | {
      kind: 'invalid-response';
      status: number;
      message: string;
    }
  | {
      kind: 'connector-not-found';
    }
  | {
      kind: 'unauthorized';
      status: number;
    };

/**
 * Discriminated outcome of a sync attempt. Callers must check `ok` before
 * touching `result` / `failure`. Never throws — every error path is
 * surfaced as `{ ok: false, failure }`.
 */
export type ChargeSyncOutcome =
  | {
      ok: true;
      result: ChargeSyncResult;
    }
  | {
      ok: false;
      failure: ChargeSyncFailure;
    };

/**
 * Result of probing a provider with the user's browser session token to see
 * whether it's still accepted upstream. Does NOT mutate state.
 *
 * On success: `valid: true`, `status` is the HTTP status returned by the
 * upstream probe (typically 200).
 *
 * On failure: `valid: false`, plus a `reason`:
 * - `'invalid-token'`  — upstream cleanly rejected the token (4xx).
 * - `'upstream-error'` — upstream returned 5xx; token may still be valid.
 * - `'request-failed'` — network/timeout, or token shape was malformed.
 *                      `status` is `null` in this case.
 */
export type ChargeValidationResult =
  | {
      valid: true;
      status: number;
    }
  | {
      valid: false;
      status: number | null;
      reason: 'invalid-token' | 'upstream-error' | 'request-failed';
    };

/**
 * Tunable parameters for a single sync invocation. Optional throughout —
 * each provider supplies its own defaults when a field is absent.
 *
 * - `laterThan` — Unix-ms cutoff. Sessions starting strictly before this
 *                 time may still be fetched (depending on pagination
 *                 semantics) but will not be persisted. When omitted,
 *                 ChargePoint defaults to a 90-day lookback; SWTCH has no
 *                 default cutoff (single page, no pagination).
 */
export type ChargeSyncOptions = {
  laterThan?: number;
};

/**
 * Abstraction over a third-party charging-data provider. One implementation
 * per supported provider, registered in the registry by string key.
 *
 * Implementations must be stateless and reentrant — the route handler
 * holds a single shared instance and may invoke methods concurrently for
 * different connectors.
 *
 * Naming note: this is `ChargeProvider` (not `ProviderSync`) so the
 * interface can grow to cover non-sync concerns later (payment, account
 * info, station metadata) without a rename cascade.
 */
export interface ChargeProvider {
  /**
   * Probe the upstream API with the given browser session token to confirm
   * it's still accepted. Pure observation — does not mutate any database
   * state. Used by the `/connector/:id/auth` endpoint.
   */
  validateBrowserToken(token: BrowserSessionToken): Promise<ChargeValidationResult>;

  /**
   * Fetch the user's charging history from the upstream provider, parse
   * it, and persist new rows into `chargeSessions`. Existing rows (matched
   * by `(connectorId, providerSessionId)`) are left untouched.
   *
   * @param db          App database handle. The implementation owns its own
   *                    transactions; the caller must not pass an open one.
   * @param connectorId The `connector.id` whose `userId` will own the
   *                    inserted sessions. Implementations resolve the
   *                    owning user themselves; `connector-not-found` is
   *                    returned if the row is missing.
   * @param token       Browser session token used to authenticate upstream.
   * @param options     Optional knobs (see `ChargeSyncOptions`).
   * @returns           `ChargeSyncOutcome` — never throws on expected
   *                    failure paths (network, parse, auth). Unexpected
   *                    bugs may still throw.
   */
  syncConnector(
    db: AppDb,
    connectorId: string,
    token: BrowserSessionToken,
    options?: ChargeSyncOptions,
  ): Promise<ChargeSyncOutcome>;
}
