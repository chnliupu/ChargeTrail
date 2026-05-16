import { log } from '../logger/index.js';

export type BrowserSessionToken = {
  Cookie: string;
  'User-Agent': string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate the browser-session token shape used by cookie-backed providers.
 */
export function isBrowserSessionToken(value: unknown): value is BrowserSessionToken {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const token = value as Partial<BrowserSessionToken>;
  return isNonEmptyString(token.Cookie) && isNonEmptyString(token['User-Agent']);
}

/**
 * Parse a stored browser-session token from the connector token column.
 */
export function parseStoredBrowserSessionToken(
  storedTokenJson: string,
  fn = 'browserToken.parseStoredToken',
): BrowserSessionToken | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedTokenJson);
  } catch {
    log.warn(
      {
        fn,
      },
      'stored token is not valid JSON',
    );
    return null;
  }

  if (!isBrowserSessionToken(parsed)) {
    log.warn(
      {
        fn,
      },
      'stored token does not match the expected shape',
    );
    return null;
  }

  return {
    Cookie: parsed.Cookie.trim(),
    'User-Agent': parsed['User-Agent'].trim(),
  };
}

/**
 * Serialize a browser-session token for storage in the connector token column.
 */
export function serializeBrowserSessionToken(token: BrowserSessionToken): string {
  return JSON.stringify({
    Cookie: token.Cookie.trim(),
    'User-Agent': token['User-Agent'].trim(),
  });
}
