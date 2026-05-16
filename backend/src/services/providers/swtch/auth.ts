import { log } from '../../logger/index.js';
import type { BrowserSessionToken } from '../browser-token.js';
import { isBrowserSessionToken } from '../browser-token.js';
import type { ChargeValidationResult } from '../types.js';

export const SWTCH_ACTIVITIES_URL = 'https://charge.swtchenergy.com/en/activities';
const SWTCH_ORIGIN = 'https://charge.swtchenergy.com';
const VALIDATE_TIMEOUT_MS = 10_000;

export type SwtchToken = BrowserSessionToken;

function buildHeaders(token: SwtchToken): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en,en-US;q=0.9',
    Cookie: token.Cookie,
    Referer: `${SWTCH_ORIGIN}/en/activities`,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': token['User-Agent'],
  };
}

/**
 * Validate a SWTCH browser session by loading the charging activity page.
 */
export async function validateBrowserToken(token: SwtchToken): Promise<ChargeValidationResult> {
  const normalizedToken = {
    Cookie: token.Cookie.trim(),
    'User-Agent': token['User-Agent'].trim(),
  };

  if (!isBrowserSessionToken(normalizedToken)) {
    log.warn(
      {
        fn: 'swtch.validateBrowserToken',
      },
      'provided token is missing required fields',
    );
    return {
      valid: false,
      status: null,
      reason: 'request-failed',
    };
  }

  try {
    const response = await fetch(SWTCH_ACTIVITIES_URL, {
      method: 'GET',
      headers: buildHeaders(normalizedToken),
      redirect: 'manual',
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });

    if (response.status === 200) {
      log.info(
        {
          fn: 'swtch.validateBrowserToken',
          status: response.status,
          valid: true,
        },
        'token accepted by swtch',
      );
      return {
        valid: true,
        status: response.status,
      };
    }

    const responseKind = response.status >= 500 ? 'upstream-error' : 'invalid-token';
    log.info(
      {
        fn: 'swtch.validateBrowserToken',
        status: response.status,
        location: response.headers.get('location'),
        valid: false,
        reason: responseKind,
      },
      'token rejected by swtch',
    );
    return {
      valid: false,
      status: response.status,
      reason: responseKind,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(
      {
        fn: 'swtch.validateBrowserToken',
        err: reason,
      },
      'token validation request failed',
    );
    return {
      valid: false,
      status: null,
      reason: 'request-failed',
    };
  }
}
