import { describe, expect, it } from 'vitest';
import { periodToRange } from './period';

/**
 * Build a local-time Date the same way the implementation does so the tests
 * are independent of the host timezone.
 */
function localDate(
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0,
  ms = 0,
) {
  return new Date(y, m, d, h, min, s, ms);
}

describe('periodToRange', () => {
  const now = new Date(2026, 4, 9, 12, 34, 56, 789); // 2026-05-09 12:34:56.789 local

  it('returns null for "all"', () => {
    expect(periodToRange('all', now)).toBeNull();
  });

  it('snaps the end bound to the last millisecond of today (local)', () => {
    const r = periodToRange('30d', now)!;
    expect(r.to).toBe(localDate(2026, 4, 9, 23, 59, 59, 999).toISOString());
  });

  it('snaps the start bound to the first millisecond of the day N days ago', () => {
    expect(periodToRange('30d', now)!.from).toBe(
      localDate(2026, 3, 9, 0, 0, 0, 0).toISOString(),
    );
    expect(periodToRange('90d', now)!.from).toBe(
      localDate(2026, 4, 9 - 90, 0, 0, 0, 0).toISOString(),
    );
    expect(periodToRange('1y', now)!.from).toBe(
      localDate(2026, 4, 9 - 365, 0, 0, 0, 0).toISOString(),
    );
  });

  it('is stable across different times of the same calendar day', () => {
    const morning = new Date(2026, 4, 9, 1, 2, 3, 4);
    const evening = new Date(2026, 4, 9, 22, 33, 44, 555);
    expect(periodToRange('30d', morning)).toEqual(
      periodToRange('30d', evening),
    );
  });

  it('serializes both bounds as ISO-8601 strings', () => {
    const r = periodToRange('30d', now)!;
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
