import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataPage } from './DataPage';
import type { ConnectorWithCount } from '../api/connectors';
import type { Session, FetchAllSessionsResult } from '../api/sessions';

// Mocks for the hooks DataPage consumes. Each mock is a vi.fn so individual
// tests can override its return value.
const mockIsMobile = vi.fn(() => false);
const mockUseSessionsRange = vi.fn();
const mockUseConnectors = vi.fn();

vi.mock('../api/hooks', () => ({
  useSessionsRange: (...args: unknown[]) => mockUseSessionsRange(...args),
  useConnectors: (...args: unknown[]) => mockUseConnectors(...args),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile(),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    userId: 'u-1',
    connectorId: 'c-cp-1',
    provider: 'ChargePoint',
    providerSessionId: 'cp-123',
    startedAt: '2026-05-01T12:00:00.000Z',
    endedAt: '2026-05-01T13:00:00.000Z',
    powerKwh: 12.34,
    durationSeconds: 3600,
    price: 4.56,
    pricePerHour: null,
    pricePerKwh: 0.37,
    currency: 'USD',
    lat: 37.77,
    lon: -122.41,
    address1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zipcode: '94105',
    country: 'US',
    deviceName: 'Station A',
    deviceId: 1,
    vehicleId: null,
    ...overrides,
  };
}

function makeConnector(
  overrides: Partial<ConnectorWithCount> = {},
): ConnectorWithCount {
  return {
    id: 'c-cp-1',
    provider: 'chargepoint',
    providerUsername: 'alice@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastSyncedAt: null,
    sessionCount: 0,
    ...overrides,
  };
}

function mockSessionsResult(sessions: Session[]): FetchAllSessionsResult {
  return { sessions, truncated: false };
}

function setSessions(sessions: Session[]) {
  mockUseSessionsRange.mockReturnValue({
    data: mockSessionsResult(sessions),
    isLoading: false,
    isError: false,
    error: null,
  });
}

function setConnectors(connectors: ConnectorWithCount[]) {
  mockUseConnectors.mockReturnValue({
    data: { connectors },
    isLoading: false,
    isError: false,
    error: null,
  });
}

describe('DataPage responsive layout', () => {
  it('renders a table on tablet/desktop viewports', () => {
    mockIsMobile.mockReturnValue(false);
    setSessions([makeSession()]);
    setConnectors([makeConnector()]);

    const { container } = render(<DataPage />);

    expect(container.querySelector('table')).not.toBeNull();
    expect(
      screen.getByText('San Francisco', { exact: false }),
    ).toBeInTheDocument();
  });

  it('uses provider metadata for the desktop provider column', () => {
    mockIsMobile.mockReturnValue(false);
    setSessions([makeSession({ provider: 'chargepoint' })]);
    setConnectors([makeConnector()]);

    const { container } = render(<DataPage />);

    const providerCell = container.querySelector('tbody tr td:nth-child(2)');
    expect(providerCell).not.toBeNull();
    expect(providerCell).toHaveTextContent('ChargePoint');
    expect(providerCell).not.toHaveTextContent('chargepoint');

    const badge = providerCell?.firstElementChild;
    expect(badge?.firstElementChild?.tagName.toLowerCase()).toBe('img');
    expect(badge?.firstElementChild).toHaveAttribute('alt', 'ChargePoint logo');
    expect(badge?.lastElementChild).toHaveTextContent('ChargePoint');
  });

  it('renders stacked cards (no table) on mobile viewports', () => {
    mockIsMobile.mockReturnValue(true);
    setSessions([makeSession()]);
    setConnectors([makeConnector()]);

    const { container } = render(<DataPage />);

    expect(container.querySelector('table')).toBeNull();
    expect(
      screen.getByText('San Francisco', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
  });
});

describe('DataPage provider filter dropdown', () => {
  it('lists All + one entry per connector and toggles to "Selective"', async () => {
    mockIsMobile.mockReturnValue(false);
    setSessions([
      makeSession({ id: 's1', connectorId: 'c-cp-1', city: 'San Francisco' }),
      makeSession({
        id: 's2',
        connectorId: 'c-sw-1',
        provider: 'SWTCH Energy',
        city: 'Toronto',
      }),
    ]);
    setConnectors([
      makeConnector({ id: 'c-cp-1', provider: 'chargepoint' }),
      makeConnector({
        id: 'c-sw-1',
        provider: 'swtch',
        providerUsername: 'bob@example.com',
      }),
    ]);

    const user = userEvent.setup();
    render(<DataPage />);

    // Trigger initially reads "All providers"
    const trigger = screen.getByRole('button', { name: /filter by provider/i });
    expect(trigger).toHaveTextContent('All providers');

    await user.click(trigger);
    // Menu options
    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'All' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'ChargePoint' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'SWTCH Energy' }),
    ).toBeInTheDocument();

    // Both rows visible under "All".
    expect(
      screen.getByText('San Francisco', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Toronto', { exact: false })).toBeInTheDocument();

    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'ChargePoint' }),
    );

    // Trigger label flips
    expect(trigger).toHaveTextContent('Selective');

    // Only the ChargePoint session remains in the table.
    expect(
      screen.getByText('San Francisco', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Toronto', { exact: false }),
    ).not.toBeInTheDocument();
  });

  it('disambiguates duplicate providers with the username suffix', async () => {
    mockIsMobile.mockReturnValue(false);
    setSessions([]);
    setConnectors([
      makeConnector({
        id: 'c-cp-a',
        provider: 'chargepoint',
        providerUsername: 'alice@example.com',
      }),
      makeConnector({
        id: 'c-cp-b',
        provider: 'chargepoint',
        providerUsername: 'bob@example.com',
      }),
    ]);

    const user = userEvent.setup();
    render(<DataPage />);

    await user.click(
      screen.getByRole('button', { name: /filter by provider/i }),
    );

    expect(
      await screen.findByRole('menuitemcheckbox', {
        name: 'ChargePoint - alice@example.com',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', {
        name: 'ChargePoint - bob@example.com',
      }),
    ).toBeInTheDocument();
  });

  it('clicking "All" after a selection restores the full row count', async () => {
    mockIsMobile.mockReturnValue(false);
    setSessions([
      makeSession({ id: 's1', connectorId: 'c-cp-1', city: 'San Francisco' }),
      makeSession({
        id: 's2',
        connectorId: 'c-sw-1',
        provider: 'SWTCH Energy',
        city: 'Toronto',
      }),
    ]);
    setConnectors([
      makeConnector({ id: 'c-cp-1', provider: 'chargepoint' }),
      makeConnector({ id: 'c-sw-1', provider: 'swtch' }),
    ]);

    const user = userEvent.setup();
    render(<DataPage />);

    const trigger = screen.getByRole('button', { name: /filter by provider/i });
    await user.click(trigger);
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'ChargePoint' }),
    );
    expect(trigger).toHaveTextContent('Selective');
    expect(
      screen.queryByText('Toronto', { exact: false }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'All' }));
    expect(trigger).toHaveTextContent('All providers');
    expect(
      screen.getByText('San Francisco', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Toronto', { exact: false })).toBeInTheDocument();
  });
});

describe('DataPage time-range presets', () => {
  it('updates aria-pressed when a period preset is clicked', async () => {
    mockIsMobile.mockReturnValue(false);
    setSessions([]);
    setConnectors([]);

    const user = userEvent.setup();
    const { container } = render(<DataPage />);

    // Period presets live in a flex row at the start of the toolbar; locate
    // them by their visible labels.
    const presetGroup = container.querySelector('.flex.flex-wrap.gap-1');
    expect(presetGroup).not.toBeNull();
    const last30 = within(presetGroup as HTMLElement).getByRole('button', {
      name: 'Last 30d',
    });
    const lastYear = within(presetGroup as HTMLElement).getByRole('button', {
      name: 'Last year',
    });
    // 30d is the default.
    expect(last30).toHaveAttribute('aria-pressed', 'true');
    expect(lastYear).toHaveAttribute('aria-pressed', 'false');

    await user.click(lastYear);

    expect(last30).toHaveAttribute('aria-pressed', 'false');
    expect(lastYear).toHaveAttribute('aria-pressed', 'true');
  });
});
