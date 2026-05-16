import { log } from '../../logger/index.js';
import type { BrowserSessionToken } from '../browser-token.js';
import {
  isBrowserSessionToken,
  parseStoredBrowserSessionToken,
  serializeBrowserSessionToken,
} from '../browser-token.js';
import type { ChargeValidationResult } from '../types.js';

const MONTHLY_CHARGING_ACTIVITY_API_URL = 'https://mc-ca.chargepoint.com/map-prod/v2';
const MAP_APP_ORIGIN = 'https://driver.chargepoint.com/';
const VALIDATE_TIMEOUT_MS = 10_000;

const VALIDATION_PAYLOAD = {
  charging_activity_monthly: {
    page_size: 20,
    show_address_for_home_sessions: true,
  },
};

export type ChargePointToken = BrowserSessionToken;

/**
 * Validate the ChargePoint browser-session token shape.
 */
export function isChargePointToken(value: unknown): value is ChargePointToken {
  return isBrowserSessionToken(value);
}

/**
 * Parse a ChargePoint token stored in the connector token column.
 */
export function parseStoredToken(storedTokenJson: string): ChargePointToken | null {
  return parseStoredBrowserSessionToken(storedTokenJson, 'chargepoint.parseStoredToken');
}

/**
 * Serialize a ChargePoint token for storage in the connector token column.
 */
export function serializeToken(token: ChargePointToken): string {
  return serializeBrowserSessionToken(token);
}

function buildValidationHeaders(token: ChargePointToken): Record<string, string> {
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

export async function validateBrowserToken(
  token: ChargePointToken,
): Promise<ChargeValidationResult> {
  const normalizedToken = {
    Cookie: token.Cookie.trim(),
    'User-Agent': token['User-Agent'].trim(),
  };

  if (!isChargePointToken(normalizedToken)) {
    log.warn(
      {
        fn: 'chargepoint.validateBrowserToken',
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
    const response = await fetch(MONTHLY_CHARGING_ACTIVITY_API_URL, {
      method: 'POST',
      headers: buildValidationHeaders(normalizedToken),
      body: JSON.stringify(VALIDATION_PAYLOAD),
      redirect: 'manual',
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });

    if (response.ok) {
      log.info(
        {
          fn: 'chargepoint.validateBrowserToken',
          status: response.status,
          valid: true,
        },
        'token accepted by chargepoint',
      );
      return {
        valid: true,
        status: response.status,
      };
    }

    const responseKind = response.status >= 500 ? 'upstream-error' : 'invalid-token';
    log.info(
      {
        fn: 'chargepoint.validateBrowserToken',
        status: response.status,
        location: response.headers.get('location'),
        valid: false,
        reason: responseKind,
      },
      'token rejected by chargepoint',
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
        fn: 'chargepoint.validateBrowserToken',
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
