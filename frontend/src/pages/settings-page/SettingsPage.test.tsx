import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../../auth/AuthContext';
import { AuthContext } from '../../auth/AuthContext';
import { i18n, LANGUAGE_STORAGE_KEY } from '../../locale';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { SettingsPage } from './SettingsPage';

const baseUser = {
  email: 'ada@example.com',
  id: 'u-1',
  name: 'Ada Lovelace',
  role: 'user',
  username: 'ada',
};

function renderSettings(overrides: Partial<AuthContextValue> = {}) {
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
    <ThemeProvider>
      <AuthContext.Provider value={value}>
        <SettingsPage />
      </AuthContext.Provider>
    </ThemeProvider>,
  );

  return value;
}

describe('SettingsPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'dark';
    await i18n.changeLanguage('en');
  });

  it('renders account fields from auth context with read-only email', () => {
    renderSettings();

    expect(screen.getByLabelText('Display name')).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('Username')).toHaveValue('ada');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByText('@ada')).toBeInTheDocument();
  });

  it('saves only mutable profile fields', async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn().mockResolvedValue({
      ...baseUser,
      name: 'Augusta Ada',
    });
    renderSettings({ updateProfile });

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Augusta Ada');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        name: 'Augusta Ada',
        username: 'ada',
      });
    });
    expect(updateProfile.mock.calls[0][0]).not.toHaveProperty('email');
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  });

  it('shows profile save errors', async () => {
    const user = userEvent.setup();
    renderSettings({
      updateProfile: vi.fn().mockRejectedValue(new Error('Username is taken.')),
    });

    await user.clear(screen.getByLabelText('Username'));
    await user.type(screen.getByLabelText('Username'), 'ada-2');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    expect(await screen.findByText('Username is taken.')).toBeInTheDocument();
  });

  it('validates mismatched and short passwords', async () => {
    const user = userEvent.setup();
    const changePassword = vi.fn();
    renderSettings({ changePassword });

    await user.type(screen.getByLabelText('Current password'), 'old-pass-123');
    await user.type(screen.getByLabelText('New password'), 'new-pass-123');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('New password'));
    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(
      screen.getByText('Password must be at least 8 characters.'),
    ).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('submits valid password changes and clears fields', async () => {
    const user = userEvent.setup();
    const changePassword = vi.fn().mockResolvedValue(undefined);
    renderSettings({ changePassword });

    await user.type(screen.getByLabelText('Current password'), 'old-pass-123');
    await user.type(screen.getByLabelText('New password'), 'new-pass-123');
    await user.type(
      screen.getByLabelText('Confirm new password'),
      'new-pass-123',
    );
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-pass-123',
        newPassword: 'new-pass-123',
      });
    });
    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('');
  });

  it('toggles light and dark appearance', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /light/i }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('es-theme')).toBe('light');

    await user.click(screen.getByRole('button', { name: /dark/i }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('es-theme')).toBe('dark');
  });

  it('renders language options and applies a selected language', async () => {
    const user = userEvent.setup();
    renderSettings();

    const languageSelect = screen.getByLabelText('Language');
    expect(screen.getByRole('option', { name: 'English' })).toHaveValue('en');
    expect(screen.getByRole('option', { name: '简体中文' })).toHaveValue(
      'zh-CN',
    );
    expect(screen.getByRole('option', { name: 'Français' })).toHaveValue('fr');

    await user.selectOptions(languageSelect, 'fr');

    expect(await screen.findByText('Paramètres du compte')).toBeInTheDocument();
    expect(screen.getByLabelText('Langue')).toHaveValue('fr');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  });
});
