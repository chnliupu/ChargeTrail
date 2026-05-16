import type { AppDb } from '../../db/index.js';
import type { BrowserSessionToken } from '../browser-token.js';
import type {
  ChargeProvider,
  ChargeSyncOptions,
  ChargeSyncOutcome,
  ChargeValidationResult,
} from '../types.js';
import { validateBrowserToken as validateChargePointToken } from './auth.js';
import { syncChargePointConnector } from './sync.js';

/**
 * ChargePoint adapter. Talks to `mc-ca.chargepoint.com/map-prod/v2` (the
 * map-app monthly-activity API).
 *
 * Sync behavior:
 * - Paginated. Walks pages of 20 sessions until one of: upstream reports
 *   `'last_page'`, an entire page is already in the DB (`'all-existing'`),
 *   an empty page returns (`'empty-page'`), the page crosses the
 *   `laterThan` boundary (`'older-than-boundary'`), or the defensive
 *   200-page cap is hit (`'max-pages-reached'`).
 * - Default lookback. When `options.laterThan` is omitted, ChargePoint
 *   defaults to 90 days back from `Date.now()`. Pass an explicit
 *   `laterThan` for a different window.
 * - Per-page persistence. Each page is written before the next is fetched,
 *   so a partial sync on failure still durably inserts the pages that
 *   succeeded.
 */
class ChargePointProvider implements ChargeProvider {
  /**
   * Probes the same monthly-activity endpoint with a minimal POST body.
   * 4xx → `'invalid-token'`; 5xx → `'upstream-error'`.
   */
  validateBrowserToken(token: BrowserSessionToken): Promise<ChargeValidationResult> {
    return validateChargePointToken(token);
  }

  syncConnector(
    db: AppDb,
    connectorId: string,
    token: BrowserSessionToken,
    options?: ChargeSyncOptions,
  ): Promise<ChargeSyncOutcome> {
    return syncChargePointConnector(db, connectorId, token, options?.laterThan);
  }
}

export const chargePointProvider: ChargeProvider = new ChargePointProvider();
