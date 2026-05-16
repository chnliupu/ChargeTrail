import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SummaryBarChart } from './SummaryBarChart';

class ResizeObserverMock {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 320,
            height: 240,
            top: 0,
            left: 0,
            bottom: 240,
            right: 320,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      this,
    );
  }

  unobserve() {}

  disconnect() {}
}

describe('SummaryBarChart', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
  });

  it('gives Recharts a fixed height so the initial responsive measurement does not warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <SummaryBarChart
        data={[{ key: '2026-05-01', kwh: 12, cost: 4, count: 1 }]}
        valueKey="kwh"
        groupBy="day"
        color="var(--es-accent-green)"
        formatValue={(value) => `${value.toFixed(1)} kWh`}
      />,
    );

    const responsiveContainer = container.querySelector<HTMLElement>(
      '.recharts-responsive-container',
    );

    expect(responsiveContainer).toHaveStyle({
      width: '100%',
      height: '240px',
    });
    await waitFor(() =>
      expect(container.querySelector('svg')).toBeInTheDocument(),
    );
    expect(
      warnSpy.mock.calls.some(([message]) =>
        String(message).includes('The width('),
      ),
    ).toBe(false);
  });
});
