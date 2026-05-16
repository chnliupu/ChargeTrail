import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorWithCount } from '../../api/connectors';
import { i18n } from '../../locale';
import { ConnectorsPage } from './ConnectorsPage';

const mockUseConnectors = vi.fn();
const mockUseSyncConnector = vi.fn();
const mockUseAddConnector = vi.fn();
const mockUseUpdateConnector = vi.fn();
const mockUseDeleteConnector = vi.fn();

vi.mock('../../api/hooks', () => ({
  useConnectors: (...args: unknown[]) => mockUseConnectors(...args),
  useSyncConnector: () => mockUseSyncConnector(),
  useAddConnector: () => mockUseAddConnector(),
  useUpdateConnector: () => mockUseUpdateConnector(),
  useDeleteConnector: () => mockUseDeleteConnector(),
}));

function makeConnector(
  overrides: Partial<ConnectorWithCount> = {},
): ConnectorWithCount {
  return {
    id: 'connector-1',
    provider: 'chargepoint',
    providerUsername: 'alice@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastSyncedAt: null,
    sessionCount: 0,
    ...overrides,
  };
}

function setConnectors(connectors: ConnectorWithCount[]) {
  mockUseConnectors.mockReturnValue({
    data: { connectors },
    isLoading: false,
    isError: false,
    error: null,
  });
}

describe('ConnectorsPage i18n', () => {
  beforeEach(async () => {
    mockUseConnectors.mockReset();
    mockUseSyncConnector.mockReset();
    mockUseAddConnector.mockReset();
    mockUseUpdateConnector.mockReset();
    mockUseDeleteConnector.mockReset();

    mockUseSyncConnector.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseAddConnector.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseUpdateConnector.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseDeleteConnector.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    await i18n.changeLanguage('en');
  });

  it('renders the empty connector page in French', async () => {
    setConnectors([]);
    await i18n.changeLanguage('fr');

    render(<ConnectorsPage />);

    expect(
      screen.getByRole('heading', { name: 'Connecteurs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Aucun connecteur pour le moment. Ajoutez-en un pour commencer la synchronisation.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Fonctionnement')).toBeInTheDocument();
  });

  it('renders connector metadata with Simplified Chinese plurals', async () => {
    setConnectors([
      makeConnector({
        sessionCount: 2,
        lastSyncedAt: null,
      }),
    ]);
    await i18n.changeLanguage('zh-CN');

    render(<ConnectorsPage />);

    expect(screen.getByText('2 条记录')).toBeInTheDocument();
    expect(screen.getByText('从未同步')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '同步' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '删除连接器' }),
    ).toBeInTheDocument();
  });

  it('opens the add connector dialog with translated labels', async () => {
    const user = userEvent.setup();
    setConnectors([]);
    await i18n.changeLanguage('fr');

    render(<ConnectorsPage />);
    await user.click(
      screen.getAllByRole('button', { name: 'Ajouter un connecteur' })[0],
    );

    expect(
      screen.getByRole('dialog', { name: 'Ajouter un connecteur' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Fournisseur')).toBeInTheDocument();
    expect(
      screen.getByText("E-mail ou nom d'utilisateur du compte"),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Comment récupérer votre jeton :'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Utiliser le User-Agent du navigateur actuel',
      }),
    ).toBeInTheDocument();
  });
});
