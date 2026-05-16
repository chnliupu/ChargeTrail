import type { AppDb } from '../../db/index.js';
import type { BrowserSessionToken } from '../browser-token.js';
import type {
  ChargeProvider,
  ChargeSyncOptions,
  ChargeSyncOutcome,
  ChargeValidationResult,
} from '../types.js';
import { validateBrowserToken as validateSwtchToken } from './auth.js';
import { syncSwtchConnector } from './sync.js';

/**
 * SWTCH adapter. Scrapes the HTML activities page at
 * `charge.swtchenergy.com/en/activities`.
 *
 * Sync behavior:
 * - Single page only. SWTCH's activities page is not paginated; one HTTP
 *   request returns whatever sessions the page surfaces. `pagesFetched`
 *   is therefore always 1.
 * - `laterThan` is a post-fetch filter, not an upstream parameter.
 *   Sessions with `startedAt < laterThan` are dropped before insertion;
 *   `stoppedReason` is set to `'older-than-boundary'` only when at least
 *   one session was filtered out.
 * - Auth quirk. SWTCH treats any 3xx redirect on the activities page as
 *   an auth failure (the marketing site bounces unauthenticated visitors).
 *   The underlying `fetchSwtchActivities` already maps redirects to
 *   `'unauthorized'` via `redirect: 'manual'`.
 */
class SwtchProvider implements ChargeProvider {
  /**
   * Probes the activities page with `redirect: 'manual'`. A 200 response
   * means the token was accepted; anything else (including 3xx) means it
   * was rejected.
   */
  validateBrowserToken(token: BrowserSessionToken): Promise<ChargeValidationResult> {
    return validateSwtchToken(token);
  }

  syncConnector(
    db: AppDb,
    connectorId: string,
    token: BrowserSessionToken,
    options?: ChargeSyncOptions,
  ): Promise<ChargeSyncOutcome> {
    return syncSwtchConnector(db, connectorId, token, options?.laterThan);
  }
}

export const swtchProvider: ChargeProvider = new SwtchProvider();
