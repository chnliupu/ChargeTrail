import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AuthContextValue } from '../auth/AuthContext';
import { AuthContext } from '../auth/AuthContext';
import { i18n } from '../locale';
import { AppShell } from './AppShell';

const baseUser = {
  email: 'ada@example.com',
  id: 'u-1',
  name: 'Ada Lovelace',
  role: 'user',
  username: 'ada',
};

const adminUser = {
  ...baseUser,
  role: 'admin',
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function mockDesktopViewport() {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function mockMobileViewport() {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 480,
  });
  // The shadcn sidebar uses a `(max-width: 767px)` media query to detect
  // mobile, so always report `matches: true` for that lookup in tests.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderAppShell(
  path = '/data',
  overrides: Partial<AuthContextValue> = {},
) {
  const value: AuthContextValue = {
    isLoading: false,
    needsSetup: false,
    user: baseUser,
    signIn: vi.fn(),
    setupAdmin: vi.fn().mockResolvedValue(baseUser),
    signOut: vi.fn(),
    updateProfile: vi.fn().mockResolvedValue(baseUser),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/connectors" element={<div>Connectors outlet</div>} />
            <Route path="/data" element={<div>Data outlet</div>} />
            <Route path="/summary" element={<div>Summary outlet</div>} />
            <Route path="/settings" element={<div>Settings outlet</div>} />
            <Route
              path="/admin/settings"
              element={<div>Admin settings outlet</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return value;
}

describe('AppShell', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    mockDesktopViewport();
    window.scrollTo = vi.fn();
    globalThis.ResizeObserver = ResizeObserverMock;
    document.cookie = '';
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the current route title and outlet', () => {
    renderAppShell('/data');

    expect(
      screen.getByRole('heading', { name: 'Charging Sessions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Data outlet')).toBeInTheDocument();
  });

  it('renders primary navigation links with the active route state', () => {
    renderAppShell('/summary');

    expect(screen.getByRole('link', { name: /connectors/i })).toHaveAttribute(
      'href',
      '/connectors',
    );
    expect(screen.getByRole('link', { name: /data/i })).toHaveAttribute(
      'href',
      '/data',
    );
    expect(screen.getByRole('link', { name: /summary/i })).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(
      screen.queryByRole('link', { name: /settings/i }),
    ).not.toBeInTheDocument();
  });

  it('renders translated navigation and account menu labels', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('fr');
    renderAppShell('/summary', { user: adminUser });

    expect(screen.getByRole('heading', { name: 'Résumé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connecteurs/i })).toHaveAttribute(
      'href',
      '/connectors',
    );

    await user.click(
      screen.getByRole('button', { name: /ouvrir le menu du compte/i }),
    );

    expect(
      await screen.findByRole('menuitem', { name: /paramètres admin/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /se déconnecter/i }),
    ).toBeInTheDocument();
  });

  it('renders the signed-in user in the sidebar footer', () => {
    renderAppShell('/data');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('@ada')).toBeInTheDocument();
  });

  it('calls signOut from the auth context', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderAppShell('/data', { signOut });

    expect(
      screen.queryByRole('button', { name: /sign out/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /open account menu/i }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /sign out/i }),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows avatar menu items with settings below admin settings for admins', async () => {
    const user = userEvent.setup();
    renderAppShell('/data', { user: adminUser });

    await user.click(
      screen.getByRole('button', { name: /open account menu/i }),
    );

    expect(
      await screen.findByRole('menuitem', { name: /admin settings/i }),
    ).toBeInTheDocument();

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual([
      'Admin settings',
      'Settings',
      'Sign out',
    ]);
  });

  it('hides admin settings from non-admin users', async () => {
    const user = userEvent.setup();
    renderAppShell('/data');

    await user.click(
      screen.getByRole('button', { name: /open account menu/i }),
    );

    expect(
      screen.queryByRole('menuitem', { name: /admin settings/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /^settings$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it('routes admin settings to its placeholder page', async () => {
    const user = userEvent.setup();
    renderAppShell('/data', { user: adminUser });

    await user.click(
      screen.getByRole('button', { name: /open account menu/i }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /admin settings/i }),
    );

    expect(
      screen.getByRole('heading', { name: 'Admin settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Admin settings outlet')).toBeInTheDocument();
  });

  it('routes settings from the account menu', async () => {
    const user = userEvent.setup();
    renderAppShell('/data');

    await user.click(
      screen.getByRole('button', { name: /open account menu/i }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /^settings$/i }),
    );

    expect(
      screen.getByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Settings outlet')).toBeInTheDocument();
  });

  it('collapses the desktop sidebar to icon mode from the app header', async () => {
    const user = userEvent.setup();
    renderAppShell('/data');

    const sidebar = document.querySelector('[data-slot="sidebar"]');
    expect(sidebar).toHaveAttribute('data-state', 'expanded');

    await user.click(
      screen.getByRole('button', { name: /toggle sidebar panel/i }),
    );

    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    expect(sidebar).toHaveAttribute('data-collapsible', 'icon');
  });

  it('renders the responsive sidebar trigger', () => {
    renderAppShell('/data');

    expect(
      screen.getByRole('button', { name: /^toggle sidebar$/i }),
    ).toBeInTheDocument();
  });

  it('opens the mobile sidebar from the responsive trigger', async () => {
    mockMobileViewport();
    const user = userEvent.setup();
    renderAppShell('/data');

    expect(
      screen.queryByRole('dialog', { name: /^sidebar$/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^toggle sidebar$/i }));

    const mobileSidebar = await screen.findByRole('dialog', {
      name: /^sidebar$/i,
    });
    expect(mobileSidebar).toHaveAttribute('data-mobile', 'true');
    expect(mobileSidebar).toHaveAttribute('data-state', 'open');
    expect(
      within(mobileSidebar).getByRole('link', { name: /summary/i }),
    ).toBeInTheDocument();
  });

  it('hides the top-bar date on mobile via responsive classes', () => {
    renderAppShell('/data');

    // The date container uses Tailwind's `hidden sm:block` so it is removed
    // from the layout on phone-width viewports. jsdom does not evaluate CSS,
    // so we assert the responsive class strategy directly.
    const date = screen.getByText(/^[A-Z][a-z]{2}, [A-Z]/);
    expect(date).toHaveClass('hidden');
    expect(date).toHaveClass('sm:block');
  });

  it.each([
    ['fr', 'dim. 10 mai 2026'],
    ['zh-CN', '2026年5月10日星期日'],
  ])('renders the top-bar date in %s', async (language, expectedDate) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 12));
    await i18n.changeLanguage(language);

    renderAppShell('/data');

    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it('shrinks the top-bar title on mobile via responsive classes', () => {
    renderAppShell('/data');

    const title = screen.getByRole('heading', { name: 'Charging Sessions' });
    expect(title).toHaveClass('text-[15px]');
    expect(title).toHaveClass('sm:text-[17px]');
  });

  it('auto-closes the mobile sidebar after navigating to a nav route', async () => {
    mockMobileViewport();
    const user = userEvent.setup();
    renderAppShell('/data');

    // Open the mobile sidebar via the responsive trigger in the top bar.
    await user.click(screen.getByRole('button', { name: /^toggle sidebar$/i }));

    const summaryLink = await screen.findByRole('link', { name: /summary/i });
    await user.click(summaryLink);

    // Navigation should have happened and the mobile Sheet (which renders
    // the nav links) should auto-close, removing the link from the DOM.
    expect(screen.getByText('Summary outlet')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /summary/i }),
    ).not.toBeInTheDocument();
  });

  it('auto-closes the mobile sidebar after selecting an account menu route', async () => {
    mockMobileViewport();
    const user = userEvent.setup();
    renderAppShell('/data');

    await user.click(screen.getByRole('button', { name: /^toggle sidebar$/i }));

    await user.click(
      await screen.findByRole('button', { name: /open account menu/i }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /^settings$/i }),
    );

    expect(screen.getByText('Settings outlet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /open account menu/i }),
    ).not.toBeInTheDocument();
  });
});
