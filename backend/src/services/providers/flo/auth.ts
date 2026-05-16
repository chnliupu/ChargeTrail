import { log } from '../../logger/index.js';
import type { BrowserSessionToken } from '../browser-token.js';
import { isBrowserSessionToken } from '../browser-token.js';
import type { ChargeSyncFailure, ChargeValidationResult } from '../types.js';
import {
  extractRequestVerificationToken,
  isAuthenticatedSessionHistoryPage,
} from './models/sessions.js';

export const FLO_ORIGIN = 'https://account.flo.ca';
export const FLO_SESSION_HISTORY_URL = `${FLO_ORIGIN}/SessionHistory`;
const VALIDATE_TIMEOUT_MS = 10_000;

export type FloToken = BrowserSessionToken;

/**
 * Build the browser-style request headers FLO expects on the
 * `SessionHistory` page. Mirrors the SWTCH/ChargePoint patterns: the cookie
 * and user-agent come from the stored token; everything else is static and
 * matches what a real Chrome session sends.
 */
export function buildFloHeaders(token: FloToken): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en,en-US;q=0.9',
    Cookie: token.Cookie,
    Referer: FLO_SESSION_HISTORY_URL,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': token['User-Agent'],
  };
}

/**
 * Outcome of fetching the SessionHistory HTML page. On success returns the
 * page body and the extracted `__RequestVerificationToken`; on any other
 * outcome returns a `ChargeSyncFailure` ready to surface to the caller.
 *
 * Shared by `validateBrowserToken` and `syncFloConnector` so both code
 * paths agree on what counts as authenticated.
 */
export type FloSessionHistoryFetchResult =
  | {
      ok: true;
      status: number;
      html: string;
      requestVerificationToken: string;
    }
  | {
      ok: false;
      failure: ChargeSyncFailure;
    };

/**
 * GET the SessionHistory HTML page with the supplied browser token,
 * disabling automatic redirect following so a 3xx bounce to the sign-in
 * page surfaces as `unauthorized` rather than a 200 sign-in body.
 */
export async function fetchSessionHistoryPage(
  token: FloToken,
  fn = 'flo.fetchSessionHistoryPage',
): Promise<FloSessionHistoryFetchResult> {
  let response: Response;
  try {
    response = await fetch(FLO_SESSION_HISTORY_URL, {
      method: 'GET',
      headers: buildFloHeaders(token),
      redirect: 'manual',
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      {
        fn,
        err: message,
      },
      'flo session history request failed',
    );
    return {
      ok: false,
      failure: {
        kind: 'request-failed',
        status: null,
        message,
      },
    };
  }

  // Redirects, 401, and 403 mean the cookie is no longer accepted.
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

  let html: string;
  try {
    html = await response.text();
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

  // FLO's sign-in page is served as a 200 HTML document with the public
  // shell instead of a redirect, so detect it here.
  if (!isAuthenticatedSessionHistoryPage(html)) {
    return {
      ok: false,
      failure: {
        kind: 'unauthorized',
        status: response.status,
      },
    };
  }

  const requestVerificationToken = extractRequestVerificationToken(html);
  if (!requestVerificationToken) {
    return {
      ok: false,
      failure: {
        kind: 'invalid-response',
        status: response.status,
        message: 'session history page did not contain __RequestVerificationToken',
      },
    };
  }

  return {
    ok: true,
    status: response.status,
    html,
    requestVerificationToken,
  };
}

/**
 * Probe the FLO SessionHistory page to confirm the stored browser token is
 * still accepted. Pure observation — does not mutate any state.
 */
export async function validateBrowserToken(token: FloToken): Promise<ChargeValidationResult> {
  const normalizedToken = {
    Cookie: token.Cookie.trim(),
    'User-Agent': token['User-Agent'].trim(),
  };

  if (!isBrowserSessionToken(normalizedToken)) {
    log.warn(
      {
        fn: 'flo.validateBrowserToken',
      },
      'provided token is missing required fields',
    );
    return {
      valid: false,
      status: null,
      reason: 'request-failed',
    };
  }

  const result = await fetchSessionHistoryPage(normalizedToken, 'flo.validateBrowserToken');

  if (result.ok) {
    log.info(
      {
        fn: 'flo.validateBrowserToken',
        status: result.status,
        valid: true,
      },
      'token accepted by flo',
    );
    return {
      valid: true,
      status: result.status,
    };
  }

  const { failure } = result;
  if (failure.kind === 'unauthorized') {
    log.info(
      {
        fn: 'flo.validateBrowserToken',
        status: failure.status,
        valid: false,
        reason: 'invalid-token',
      },
      'token rejected by flo',
    );
    return {
      valid: false,
      status: failure.status,
      reason: 'invalid-token',
    };
  }
  if (failure.kind === 'request-failed') {
    return {
      valid: false,
      status: failure.status,
      reason:
        failure.status !== null && failure.status >= 500 ? 'upstream-error' : 'request-failed',
    };
  }
  // invalid-response: the page didn't include the verification token. We
  // cannot prove the token is invalid, so report an upstream error and let
  // the caller decide what to do. (`connector-not-found` is unreachable
  // from `fetchSessionHistoryPage`; the explicit check keeps TS narrowing
  // correct without an `as` cast.)
  if (failure.kind === 'invalid-response') {
    return {
      valid: false,
      status: failure.status,
      reason: 'upstream-error',
    };
  }
  return {
    valid: false,
    status: null,
    reason: 'upstream-error',
  };
}
