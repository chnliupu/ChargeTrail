import { createHash } from 'node:crypto';

/**
 * One completed FLO charging transaction parsed from `SessionHistoryXML`.
 *
 * `providerSessionId` is synthesized: FLO's spreadsheet does not expose a
 * stable upstream id, so we hash `(startDateRaw, endDateRaw, stationName)`
 * to drive the existing `(connectorId, providerSessionId)` dedup key.
 */
export type FloChargingSession = {
  providerSessionId: string;
  cardNumber: string | null;
  parkName: string | null;
  stationName: string;
  startedAtMs: number;
  endedAtMs: number;
  powerKwh: number;
  durationSeconds: number;
  price: number;
  currency: string | null;
};

export type FloSessionHistoryParseResult = {
  sessions: FloChargingSession[];
};

const ROW_RE = /<Row\b[\s\S]*?<\/Row>/gi;
const CELL_RE = /<Cell\b[\s\S]*?<\/Cell>/gi;
const DATA_RE = /<Data\b[^>]*>([\s\S]*?)<\/Data>/i;
const REQUEST_VERIFICATION_TOKEN_RE =
  /<input\b[^>]*name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i;
const REQUEST_VERIFICATION_TOKEN_RE_REVERSED =
  /<input\b[^>]*value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i;
const ACCOUNT_WRAPPER_RE = /class=["'][^"']*\baccount-wrapper\b[^"']*["']/i;
const GUEST_WRAPPER_RE = /class=["'][^"']*\bguest-wrapper\b[^"']*["']/i;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;
const DURATION_RE = /^(\d+):(\d{2}):(\d{2})$/;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function extractCellText(cellHtml: string): string {
  const dataMatch = DATA_RE.exec(cellHtml);
  if (!dataMatch) {
    return '';
  }
  return decodeHtmlEntities(dataMatch[1]).trim();
}

function extractRowCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(CELL_RE)].map((cell) => extractCellText(cell[0]));
}

/**
 * Parse a FLO datetime string (`yyyy-MM-dd HH:mm:ss`). FLO does not include
 * a timezone offset; timestamps are treated as UTC to align with the
 * project-wide convention that all stored timestamps are UTC.
 */
function parseFloDate(value: string): number | null {
  const match = DATE_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a FLO duration string (`H:MM:SS`, hours may exceed 24) into seconds.
 */
function parseDurationSeconds(value: string): number | null {
  const match = DURATION_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Hash `(startDateRaw|endDateRaw|stationName)` to a stable session id.
 * Uses raw XML text (pre-normalization) so future parser tweaks do not
 * shift the dedup key for existing rows.
 */
export function computeFloSessionId(
  startDateRaw: string,
  endDateRaw: string,
  stationName: string,
): string {
  const hash = createHash('sha256');
  hash.update(`${startDateRaw}|${endDateRaw}|${stationName}`);
  return hash.digest('hex');
}

/**
 * Extract the hidden `__RequestVerificationToken` value from the
 * authenticated SessionHistory page. Returns `null` if the input markup
 * does not contain the token (e.g. the user is not logged in).
 */
export function extractRequestVerificationToken(html: string): string | null {
  const match = REQUEST_VERIFICATION_TOKEN_RE.exec(html);
  if (match) {
    return decodeHtmlEntities(match[1]);
  }
  // ASP.NET sometimes emits attributes in either order; tolerate both.
  const reversed = REQUEST_VERIFICATION_TOKEN_RE_REVERSED.exec(html);
  return reversed ? decodeHtmlEntities(reversed[1]) : null;
}

/**
 * True when the supplied SessionHistory HTML belongs to an authenticated
 * session. FLO renders an `account-wrapper` shell for signed-in users and
 * a `guest-wrapper` shell for the public sign-in page; both are checked,
 * with `account-wrapper` winning if both somehow appear.
 */
export function isAuthenticatedSessionHistoryPage(html: string): boolean {
  if (ACCOUNT_WRAPPER_RE.test(html)) {
    return true;
  }
  if (GUEST_WRAPPER_RE.test(html)) {
    return false;
  }
  // Fall back to the token: if the page rendered a request verification
  // token, it's the authenticated SessionHistory page.
  return extractRequestVerificationToken(html) !== null;
}

/**
 * Parse the SpreadsheetML XML returned by `SessionHistory/SessionHistoryXML`.
 * Returns `null` when the document is not a recognized FLO export (no rows,
 * unknown column layout, etc.).
 *
 * Expected column order (header row dropped):
 *   Start date | End date | Card number | Park name | Charging station name |
 *   Duration | Energy transferred (Wh) | Original cost | Original currency |
 *   Total cost | Currency
 */
export function parseFloSessionHistoryXml(xml: string): FloSessionHistoryParseResult | null {
  if (typeof xml !== 'string' || xml.length === 0) {
    return null;
  }
  const rowMatches = [...xml.matchAll(ROW_RE)];
  if (rowMatches.length === 0) {
    return null;
  }

  // First row is the header; sanity-check it before consuming data rows so
  // a future column reorder fails loudly instead of silently corrupting data.
  const headerCells = extractRowCells(rowMatches[0][0]);
  if (
    headerCells.length < 11 ||
    headerCells[0].toLowerCase() !== 'start date' ||
    headerCells[1].toLowerCase() !== 'end date' ||
    !headerCells[4].toLowerCase().includes('charging station')
  ) {
    return null;
  }

  const sessions: FloChargingSession[] = [];
  for (let i = 1; i < rowMatches.length; i++) {
    const cells = extractRowCells(rowMatches[i][0]);
    if (cells.length < 11) {
      continue;
    }
    const [
      startRaw,
      endRaw,
      cardNumberRaw,
      parkNameRaw,
      stationNameRaw,
      durationRaw,
      energyWhRaw,
      ,
      ,
      totalCostRaw,
      currencyRaw,
    ] = cells;

    const startedAtMs = parseFloDate(startRaw);
    const endedAtMs = parseFloDate(endRaw);
    const stationName = stationNameRaw.trim();
    const energyWh = parseNumber(energyWhRaw);
    const totalCost = parseNumber(totalCostRaw);
    const durationFromString = parseDurationSeconds(durationRaw);

    if (
      startedAtMs === null ||
      endedAtMs === null ||
      endedAtMs < startedAtMs ||
      stationName.length === 0 ||
      energyWh === null ||
      totalCost === null
    ) {
      continue;
    }

    const durationSeconds = durationFromString ?? Math.round((endedAtMs - startedAtMs) / 1000);

    sessions.push({
      providerSessionId: computeFloSessionId(startRaw, endRaw, stationName),
      cardNumber: nullableString(cardNumberRaw),
      parkName: nullableString(parkNameRaw),
      stationName,
      startedAtMs,
      endedAtMs,
      powerKwh: energyWh / 1000,
      durationSeconds,
      price: totalCost,
      currency: nullableString(currencyRaw),
    });
  }

  return {
    sessions,
  };
}
