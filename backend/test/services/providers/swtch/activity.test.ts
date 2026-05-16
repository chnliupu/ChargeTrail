import { describe, expect, it } from 'vitest';
import { parseSwtchActivitiesHtml } from '../../../../src/services/providers/swtch/models/activity.js';

function completedTable(
  overrides: {
    itemName?: string;
    period?: string;
    price?: string;
    kwh?: string;
    receiptId?: string;
  } = {},
): string {
  const itemName = overrides.itemName ?? `CA${Math.floor(Math.random() * 900) + 100}`;
  const receiptId =
    overrides.receiptId ?? String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  return `
    <div class='row table_border'>
      <table class='table table-my-rentals'>
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Charging Period</th>
            <th>Charging Price</th>
            <th>kWh Charged</th>
            <th>Receipt ID</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${itemName}</td>
            <td>${overrides.period ?? '05/03/2026 at 09:51 PM (PDT) to 05/03/2026 at 10:07 PM (PDT)'}</td>
            <td>${overrides.price ?? '$0.55'}</td>
            <td>${overrides.kwh ?? '1.6570 kWh'}</td>
            <td>${receiptId}</td>
            <td><a href="/en/v3_transactions/${receiptId}">View</a></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function activitiesHtml(completed: string): string {
  return `
    <article>
      <h1 class='red_heading'>Active Transaction</h1>
      <div>No active transactions</div>
      <h2 class='red_heading'>Completed Transactions</h2>
      ${completed}
      <h2 class='red_heading'>Refunded Transactions</h2>
      ${completedTable({
        itemName: 'REFUNDED',
        receiptId: '9999999',
      })}
    </article>
  `;
}

describe('SWTCH activities parser', () => {
  it('parses completed transaction rows and ignores refunded rows', () => {
    const station = `CA${Math.floor(Math.random() * 900) + 100}`;
    const receiptId = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
    const parsed = parseSwtchActivitiesHtml(
      activitiesHtml(
        completedTable({
          itemName: station,
          receiptId,
        }),
      ),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.sessions).toHaveLength(1);
    expect(parsed?.sessions[0]).toEqual({
      providerSessionId: receiptId,
      deviceName: station,
      startedAtMs: Date.parse('2026-05-04T04:51:00.000Z'),
      endedAtMs: Date.parse('2026-05-04T05:07:00.000Z'),
      powerKwh: 1.657,
      durationSeconds: 960,
      price: 0.55,
      pricePerHour: 2.0625,
      pricePerKwh: 0.55 / 1.657,
    });
  });

  it('parses PST and decodes HTML entities in station names', () => {
    const parsed = parseSwtchActivitiesHtml(
      activitiesHtml(
        completedTable({
          itemName: 'Garage &amp; Level 2',
          period: '01/10/2026 at 12:05 AM (PST) to 01/10/2026 at 01:35 AM (PST)',
          price: '$3.25',
          kwh: '6.5000 kWh',
          receiptId: '1234567',
        }),
      ),
    );

    expect(parsed?.sessions[0]?.deviceName).toBe('Garage & Level 2');
    expect(parsed?.sessions[0]?.startedAtMs).toBe(Date.parse('2026-01-10T08:05:00.000Z'));
    expect(parsed?.sessions[0]?.endedAtMs).toBe(Date.parse('2026-01-10T09:35:00.000Z'));
    expect(parsed?.sessions[0]?.durationSeconds).toBe(5400);
  });

  it('returns an empty list when the completed section has no tables', () => {
    const parsed = parseSwtchActivitiesHtml(activitiesHtml('<div>No completed transactions</div>'));
    expect(parsed).toEqual({
      sessions: [],
    });
  });

  it('rejects pages without a completed transactions section', () => {
    expect(parseSwtchActivitiesHtml('<html><body>No activity here</body></html>')).toBeNull();
  });

  it('skips malformed rows without rejecting the whole page', () => {
    const parsed = parseSwtchActivitiesHtml(
      activitiesHtml(
        [
          completedTable({
            price: 'not-money',
          }),
          completedTable({
            kwh: 'not-kwh',
          }),
          completedTable({
            period: 'not-a-period',
          }),
          completedTable({
            receiptId: '7654321',
          }),
        ].join(''),
      ),
    );

    expect(parsed?.sessions.map((session) => session.providerSessionId)).toEqual(['7654321']);
  });
});
