import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { i18n } from '../locale';
import { SetupPage } from './SetupPage';

const baseUser = {
  email: 'ada@example.com',
  id: 'u-1',
  name: 'Ada Lovelace',
  role: 'admin',
  username: 'ada',
};

function renderSetupPage(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    isLoading: false,
    needsSetup: true,
    user: null,
    signIn: vi.fn(),
    setupAdmin: vi.fn().mockResolvedValue(baseUser),
    signOut: vi.fn(),
    updateProfile: vi.fn().mockResolvedValue(baseUser),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/setup']}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/data" element={<div>Data page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return value;
}

describe('SetupPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders setup guidance while no admin exists', () => {
    renderSetupPage();

    expect(
      screen.getByRole('heading', { name: /create the first admin account/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no admin exists yet/i)).toBeInTheDocument();
  });

  it('submits trimmed values and navigates straight to data', async () => {
    const user = userEvent.setup();
    const setupAdmin = vi.fn().mockResolvedValue(baseUser);
    renderSetupPage({ setupAdmin });

    await user.type(screen.getByLabelText('Email'), ' ada@example.com ');
    await user.type(screen.getByLabelText('Username'), ' ada ');
    await user.type(screen.getByLabelText('Display name'), ' Ada ');
    await user.type(screen.getByLabelText('Password'), 'secret-123');
    await user.type(screen.getByLabelText('Confirm password'), 'secret-123');
    await user.click(
      screen.getByRole('button', { name: /create admin account/i }),
    );

    expect(setupAdmin).toHaveBeenCalledWith({
      email: 'ada@example.com',
      username: 'ada',
      password: 'secret-123',
      name: 'Ada',
    });
    expect(await screen.findByText('Data page')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('redirects to login when setup is no longer needed', async () => {
    renderSetupPage({ needsSetup: false });

    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('renders translated copy for non-English locales', async () => {
    await i18n.changeLanguage('fr');
    renderSetupPage();

    expect(
      screen.getByRole('heading', {
        name: /créer le premier compte administrateur/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/aucun administrateur n'existe encore/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /créer le compte admin/i }),
    ).toBeInTheDocument();
  });
});
