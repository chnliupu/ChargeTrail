import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeFloSessionId,
  extractRequestVerificationToken,
  isAuthenticatedSessionHistoryPage,
  parseFloSessionHistoryXml,
} from '../../../../src/services/providers/flo/models/sessions.js';

const FIXTURES = join(process.cwd(), 'test/services/providers/flo/fixtures');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('flo models — auth page detection', () => {
  it('treats the example session history page as authenticated', () => {
    const html = readFixture('flo-example.html');
    expect(isAuthenticatedSessionHistoryPage(html)).toBe(true);
  });

  it('treats the sign-in page as unauthenticated', () => {
    const html = readFixture('flo-auth-failed.html');
    expect(isAuthenticatedSessionHistoryPage(html)).toBe(false);
  });
});

describe('flo models — extractRequestVerificationToken', () => {
  it('extracts the hidden token from an authenticated page', () => {
    const html = readFixture('flo-example.html');
    const token = extractRequestVerificationToken(html);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token!.length).toBeGreaterThan(20);
  });

  it('returns null when the token is absent', () => {
    expect(extractRequestVerificationToken('<html>nothing</html>')).toBeNull();
  });

  it('tolerates value-before-name attribute order', () => {
    const html = '<input value="abc123" type="hidden" name="__RequestVerificationToken" />';
    expect(extractRequestVerificationToken(html)).toBe('abc123');
  });
});

describe('flo models — computeFloSessionId', () => {
  it('produces a stable 64-char sha-256 hex digest', () => {
    const id = computeFloSessionId(
      '2000-01-01 00:00:00',
      '2000-01-01 01:02:55',
      'STATION-TEST-001',
    );
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(
      computeFloSessionId('2000-01-01 00:00:00', '2000-01-01 01:02:55', 'STATION-TEST-001'),
    ).toBe(id);
  });

  it('changes when any input changes', () => {
    const a = computeFloSessionId('A', 'B', 'C');
    expect(computeFloSessionId('A', 'B', 'D')).not.toBe(a);
    expect(computeFloSessionId('A', 'X', 'C')).not.toBe(a);
    expect(computeFloSessionId('Z', 'B', 'C')).not.toBe(a);
  });
});

describe('flo models — parseFloSessionHistoryXml', () => {
  it('parses every data row from the example fixture', () => {
    const xml = readFixture('SessionHistory.xml');
    const parsed = parseFloSessionHistoryXml(xml);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessions.length).toBeGreaterThan(0);

    const first = parsed!.sessions[0];
    expect(first.stationName).toBe('STATION-TEST-001');
    expect(first.parkName).toBe('Example Charging Site');
    expect(first.cardNumber).toBe('TEST-CARD-0001');
    expect(first.currency).toBe('CAD');
    expect(first.price).toBeCloseTo(1.23, 5);
    expect(first.powerKwh).toBeCloseTo(5.715, 5);
    // 1:02:55 -> 3775s
    expect(first.durationSeconds).toBe(3775);
    expect(first.startedAtMs).toBe(Date.parse('2000-01-01T00:00:00Z'));
    expect(first.endedAtMs).toBe(Date.parse('2000-01-01T01:02:55Z'));
    expect(first.providerSessionId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns null on garbage input', () => {
    expect(parseFloSessionHistoryXml('')).toBeNull();
    expect(parseFloSessionHistoryXml('<html></html>')).toBeNull();
  });

  it('returns null when the header row is missing/unknown', () => {
    const xml = `<?xml version="1.0"?><Workbook><Worksheet><Table>
      <Row><Cell><Data ss:Type="String">Foo</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">2000-01-01 00:00:00</Data></Cell></Row>
    </Table></Worksheet></Workbook>`;
    expect(parseFloSessionHistoryXml(xml)).toBeNull();
  });

  it('skips rows with malformed dates without failing the whole parse', () => {
    const goodXml = readFixture('SessionHistory.xml');
    const goodCount = parseFloSessionHistoryXml(goodXml)!.sessions.length;
    // Replace the first data row's start date with an invalid value.
    const corrupted = goodXml.replace('2000-01-01 00:00:00', 'not-a-date');
    const parsed = parseFloSessionHistoryXml(corrupted);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessions.length).toBe(goodCount - 1);
  });
});
