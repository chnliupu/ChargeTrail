import type { AppDb } from '../../db/index.js';
import type { BrowserSessionToken } from '../browser-token.js';
import type {
  ChargeProvider,
  ChargeSyncOptions,
  ChargeSyncOutcome,
  ChargeValidationResult,
} from '../types.js';
import { validateBrowserToken as validateFloToken } from './auth.js';
import { syncFloConnector } from './sync.js';

/**
 * FLO adapter. Scrapes the SessionHistory page at `account.flo.ca`, then
 * downloads the XML report at `SessionHistory/SessionHistoryXML`.
 *
 * Sync behavior:
 * - Two-step. First request fetches the HTML SessionHistory page to
 *   confirm auth and extract the hidden `__RequestVerificationToken`
 *   ASP.NET MVC anti-forgery token; second request hits the XML endpoint
 *   with that token plus the date range.
 * - Single-page XML. The XML endpoint returns the entire requested range
 *   in one response (no pagination), so `pagesFetched` is always 1.
 * - `laterThan` is sent as `DateRange.From` AND applied as a post-fetch
 *   safety filter (FLO's date matching is inclusive on day boundaries).
 *   When `laterThan` is omitted, defaults to a 90-day lookback.
 * - Auth quirk. FLO redirects unauthenticated users to a public sign-in
 *   page that's served as 200 HTML. The HTML is inspected for the
 *   `account-wrapper` / `guest-wrapper` shells to decide auth state.
 * - Synthetic ids. FLO's XML rows have no upstream id; the adapter
 *   synthesizes one by SHA-256 hashing `(startDateRaw, endDateRaw,
 *   stationName)` so the existing `(connectorId, providerSessionId)`
 *   unique index keeps repeated syncs idempotent.
 */
class FloProvider implements ChargeProvider {
  validateBrowserToken(token: BrowserSessionToken): Promise<ChargeValidationResult> {
    return validateFloToken(token);
  }

  syncConnector(
    db: AppDb,
    connectorId: string,
    token: BrowserSessionToken,
    options?: ChargeSyncOptions,
  ): Promise<ChargeSyncOutcome> {
    return syncFloConnector(db, connectorId, token, options?.laterThan);
  }
}

export const floProvider: ChargeProvider = new FloProvider();
