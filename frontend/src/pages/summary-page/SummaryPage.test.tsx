import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../api/sessions';
import { SummaryPage } from './SummaryPage';

const mockUseSessionsRange = vi.fn();
const mockIsMobile = vi.fn(() => false);

vi.mock('../../api/hooks', () => ({
  useSessionsRange: (...args: unknown[]) => mockUseSessionsRange(...args),
  // ProviderBreakdown joins sessions with connectors to surface
  // providerUsername in tooltips. Tests don't care about the data here.
  useConnectors: () => ({ data: { connectors: [] }, isLoading: false }),
}));

vi.mock('../../hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile(),
}));

// Recharts pulls in ResizeObserver; jsdom doesn't have it.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? RO;

const emptySessions = {
  data: { sessions: [], truncated: false },
  isLoading: false,
  isError: false,
  error: null,
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    userId: 'u-1',
    connectorId: 'c-1',
    provider: 'ChargePoint',
    providerSessionId: 'cp-1',
    startedAt: '2026-05-01T12:00:00.000Z',
    endedAt: '2026-05-01T13:00:00.000Z',
    powerKwh: 10,
    durationSeconds: 3600,
    price: 5,
    pricePerHour: null,
    pricePerKwh: 0.5,
    currency: 'USD',
    lat: null,
    lon: null,
    address1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zipcode: null,
    country: 'US',
    deviceName: null,
    deviceId: null,
    vehicleId: null,
    ...overrides,
  };
}

function currentMonthDate(day: number) {
  const date = new Date();
  date.setDate(day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayButton(date: Date) {
  const button = document.querySelector<HTMLButtonElement>(
    `button[data-day="${date.toLocaleDateString()}"]`,
  );
  if (!button) throw new Error(`Could not find day button for ${date}`);
  return button;
}

function inclusiveIsoRange(from: Date, to: Date) {
  return {
    from: new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
      0,
      0,
      0,
      0,
    ).toISOString(),
    to: new Date(
      to.getFullYear(),
      to.getMonth(),
      to.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString(),
  };
}

describe('SummaryPage', () => {
  beforeEach(() => {
    mockUseSessionsRange.mockReset();
    mockIsMobile.mockReset();
    mockIsMobile.mockReturnValue(false);
  });

  it('shows a spinner placeholder while sessions are loading', () => {
    mockUseSessionsRange.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    render(<SummaryPage />);
    // Chart placeholder uses role="status" with "Loading chart" label.
    expect(
      screen.getByRole('status', { name: /loading chart/i }),
    ).toBeInTheDocument();
  });

  it('renders KPIs and chart heading once data resolves', () => {
    mockUseSessionsRange.mockReturnValue({
      data: {
        sessions: [
          makeSession({ id: 'a' }),
          makeSession({ id: 'b', powerKwh: 4, price: 2 }),
        ],
        truncated: false,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<SummaryPage />);
    expect(screen.getByText('Energy charged (kWh)')).toBeInTheDocument();
    // Total energy (StatCard) + provider breakdown row both show 14.0 kWh /
    // "2 sessions"; assert at least one occurrence of each.
    expect(screen.getAllByText('14.0 kWh').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2 sessions/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders an empty-state message when there are no sessions for the period', () => {
    mockUseSessionsRange.mockReturnValue(emptySessions);
    render(<SummaryPage />);
    expect(screen.getByText('No data for this period')).toBeInTheDocument();
  });

  it('places the range picker after all preset period buttons', () => {
    mockUseSessionsRange.mockReturnValue(emptySessions);
    render(<SummaryPage />);
    const allTime = screen.getByRole('button', { name: 'All time' });
    const range = screen.getByRole('button', { name: /range/i });
    expect(
      allTime.compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('opens a two-month range calendar with status and clear controls', async () => {
    const user = userEvent.setup();
    mockUseSessionsRange.mockReturnValue(emptySessions);
    render(<SummaryPage />);

    await user.click(screen.getByRole('button', { name: /range/i }));

    expect(screen.getByText('Pick a start date')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="calendar"]')).toHaveLength(1);
    expect(document.querySelectorAll('[role="grid"]')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Clear' }),
    ).not.toBeInTheDocument();
  });

  it('applies a completed custom range to the sessions query and trigger label', async () => {
    const user = userEvent.setup();
    mockUseSessionsRange.mockReturnValue(emptySessions);
    render(<SummaryPage />);

    const start = currentMonthDate(1);
    const end = currentMonthDate(9);
    await user.click(screen.getByRole('button', { name: /range/i }));
    await user.click(dayButton(start));
    expect(screen.getByText('Pick an end date')).toBeInTheDocument();
    await user.click(dayButton(end));

    await waitFor(() => {
      expect(screen.queryByText('Pick an end date')).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', {
        name: `${start.toLocaleString('en-US', { month: 'short' })} 1 - ${end.toLocaleString('en-US', { month: 'short' })} 9`,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(mockUseSessionsRange).toHaveBeenLastCalledWith({
      dateRange: inclusiveIsoRange(start, end),
    });
  });

  it('clears a custom range from the popover footer', async () => {
    const user = userEvent.setup();
    mockUseSessionsRange.mockReturnValue(emptySessions);
    render(<SummaryPage />);

    await user.click(screen.getByRole('button', { name: /range/i }));
    await user.click(dayButton(currentMonthDate(1)));
    await user.click(dayButton(currentMonthDate(9)));
    await user.click(screen.getByRole('button', { name: /\w{3} 1 - \w{3} 9/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByRole('button', { name: /range/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clicking a preset removes the custom range and returns to preset querying', async () => {
    const user = userEvent.setup();
    mockUseSessionsRange.mockReturnValue(emptySessions);
    render(<SummaryPage />);

    await user.click(screen.getByRole('button', { name: /range/i }));
    await user.click(dayButton(currentMonthDate(1)));
    await user.click(dayButton(currentMonthDate(9)));
    await user.click(screen.getByRole('button', { name: 'All time' }));

    expect(screen.getByRole('button', { name: /range/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(mockUseSessionsRange).toHaveBeenLastCalledWith({});
  });

  it('toggles chart heading when chart-type button is clicked', async () => {
    mockUseSessionsRange.mockReturnValue({
      data: { sessions: [makeSession()], truncated: false },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<SummaryPage />);
    expect(screen.getByText('Energy charged (kWh)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cost' }));
    expect(screen.getByText('Cost ($)')).toBeInTheDocument();
  });

  it('shows a truncation banner when paging hits the cap', () => {
    mockUseSessionsRange.mockReturnValue({
      data: { sessions: [makeSession()], truncated: true },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<SummaryPage />);
    expect(screen.getByText(/Showing the first/)).toBeInTheDocument();
  });
});
