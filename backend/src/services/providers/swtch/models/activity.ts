export type SwtchChargingSession = {
  providerSessionId: string;
  deviceName: string;
  startedAtMs: number;
  endedAtMs: number;
  powerKwh: number;
  durationSeconds: number;
  price: number;
  pricePerHour: number | null;
  pricePerKwh: number | null;
};

export type SwtchActivitiesParseResult = {
  sessions: SwtchChargingSession[];
};

type ParsedTableRow = {
  itemName: string;
  chargingPeriod: string;
  chargingPrice: string;
  kwhCharged: string;
  receiptId: string;
};

const COMPLETED_HEADING_RE = /<h2\b[^>]*>\s*Completed Transactions\s*<\/h2>/i;
const NEXT_SECTION_RE = /<h2\b[^>]*>\s*(?:Refunded Transactions|Active Transaction)\s*<\/h2>/i;
const TABLE_RE = /<table\b[\s\S]*?<\/table>/gi;
const ROW_RE = /<tr\b[\s\S]*?<\/tr>/gi;
const CELL_RE = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
const PERIOD_RE =
  /^(\d{2}\/\d{2}\/\d{4}) at (\d{2}):(\d{2}) ([AP]M) \((P[DS]T)\) to (\d{2}\/\d{2}\/\d{4}) at (\d{2}):(\d{2}) ([AP]M) \((P[DS]T)\)$/;
const TIMEZONE_OFFSETS: Record<string, string> = {
  PDT: '-07:00',
  PST: '-08:00',
};

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

function textContent(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCompletedSection(html: string): string | null {
  const heading = COMPLETED_HEADING_RE.exec(html);
  if (!heading) {
    return null;
  }

  const afterHeading = html.slice(heading.index + heading[0].length);
  const nextSection = NEXT_SECTION_RE.exec(afterHeading);
  return nextSection ? afterHeading.slice(0, nextSection.index) : afterHeading;
}

function extractRows(tableHtml: string): ParsedTableRow[] {
  const rows: ParsedTableRow[] = [];
  const rowMatches = tableHtml.matchAll(ROW_RE);
  for (const rowMatch of rowMatches) {
    const cells = [...rowMatch[0].matchAll(CELL_RE)].map((cell) => textContent(cell[1]));
    if (cells.length < 5) {
      continue;
    }
    rows.push({
      itemName: cells[0],
      chargingPeriod: cells[1],
      chargingPrice: cells[2],
      kwhCharged: cells[3],
      receiptId: cells[4],
    });
  }
  return rows;
}

function parseMoney(value: string): number | null {
  const match = /^\$([0-9]+(?:\.[0-9]+)?)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseKwh(value: string): number | null {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*kWh$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseHour(hour: string, meridiem: string): number {
  const parsed = Number(hour);
  if (meridiem === 'AM') {
    return parsed === 12 ? 0 : parsed;
  }
  return parsed === 12 ? 12 : parsed + 12;
}

function parseSwtchDate(
  date: string,
  hour: string,
  minute: string,
  meridiem: string,
  timezone: string,
): number | null {
  const [month, day, year] = date.split('/');
  const offset = TIMEZONE_OFFSETS[timezone];
  if (!month || !day || !year || !offset) {
    return null;
  }

  const hour24 = String(parseHour(hour, meridiem)).padStart(2, '0');
  const iso = `${year}-${month}-${day}T${hour24}:${minute}:00${offset}`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePeriod(value: string): {
  startedAtMs: number;
  endedAtMs: number;
} | null {
  const match = PERIOD_RE.exec(value.trim());
  if (!match) {
    return null;
  }

  const startedAtMs = parseSwtchDate(match[1], match[2], match[3], match[4], match[5]);
  const endedAtMs = parseSwtchDate(match[6], match[7], match[8], match[9], match[10]);
  if (startedAtMs === null || endedAtMs === null || endedAtMs < startedAtMs) {
    return null;
  }

  return {
    startedAtMs,
    endedAtMs,
  };
}

function pricePerKwh(total: number, kwh: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(kwh) || kwh <= 0) {
    return null;
  }
  return total / kwh;
}

function pricePerHour(total: number, durationSeconds: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  return total / (durationSeconds / 3600);
}

function parseRow(row: ParsedTableRow): SwtchChargingSession | null {
  const period = parsePeriod(row.chargingPeriod);
  const price = parseMoney(row.chargingPrice);
  const powerKwh = parseKwh(row.kwhCharged);
  const providerSessionId = row.receiptId.trim();
  const deviceName = row.itemName.trim();
  if (!period || price === null || powerKwh === null || !providerSessionId || !deviceName) {
    return null;
  }

  const durationSeconds = Math.round((period.endedAtMs - period.startedAtMs) / 1000);
  return {
    providerSessionId,
    deviceName,
    startedAtMs: period.startedAtMs,
    endedAtMs: period.endedAtMs,
    powerKwh,
    durationSeconds,
    price,
    pricePerHour: pricePerHour(price, durationSeconds),
    pricePerKwh: pricePerKwh(price, powerKwh),
  };
}

/**
 * Parse completed SWTCH charging transactions from the activities HTML page.
 */
export function parseSwtchActivitiesHtml(html: string): SwtchActivitiesParseResult | null {
  const completedSection = extractCompletedSection(html);
  if (completedSection === null) {
    return null;
  }

  const sessions: SwtchChargingSession[] = [];
  const tables = completedSection.matchAll(TABLE_RE);

  // Each completed transaction is rendered as a one-row table with repeated headers.
  for (const table of tables) {
    for (const row of extractRows(table[0])) {
      const session = parseRow(row);
      if (session) {
        sessions.push(session);
      }
    }
  }

  return {
    sessions,
  };
}
