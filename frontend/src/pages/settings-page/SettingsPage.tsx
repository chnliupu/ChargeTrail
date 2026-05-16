import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { Icon } from '../../components/Icon';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import {
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  type AppLanguage,
} from '../../locale';
import { useTheme, type Theme } from '../../theme/ThemeProvider';

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type FieldProps = {
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  icon?: 'user' | 'atSign' | 'mail' | 'lock';
  id: string;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
};

function Field({
  autoComplete,
  disabled,
  error,
  icon,
  id,
  label,
  onChange,
  placeholder,
  type = 'text',
  value,
}: FieldProps) {
  const errorId = `${id}-error`;
  const hasError = Boolean(error);
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-medium text-text-muted">
        {label}
      </span>
      <span className="relative block">
        {icon ? (
          <Icon
            name={icon}
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
          />
        ) : null}
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(event) => onChange?.(event.target.value)}
          className={icon ? 'pl-9' : undefined}
        />
      </span>
      {hasError ? (
        <p id={errorId} className="mt-1.5 text-xs text-error">
          {error}
        </p>
      ) : null}
    </label>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle') return null;
  const isSuccess = status.kind === 'success';
  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${
        isSuccess ? 'text-accent-green' : 'text-error'
      }`}
      role={isSuccess ? 'status' : 'alert'}
    >
      <Icon name={isSuccess ? 'check' : 'alert'} size={13} />
      {status.message}
    </div>
  );
}

const THEME_OPTIONS: Array<{
  label: string;
  value: Theme;
  preview: {
    accent: string;
    bg: string;
    card: string;
    sidebar: string;
    stripe: string;
  };
}> = [
  {
    label: 'Dark',
    value: 'dark',
    preview: {
      accent: '#38bdf8',
      bg: '#0d1520',
      card: '#111c2d',
      sidebar: '#0b1219',
      stripe: '#1c2e45',
    },
  },
  {
    label: 'Light',
    value: 'light',
    preview: {
      accent: '#0284c7',
      bg: '#f4f6f9',
      card: '#ffffff',
      sidebar: '#ffffff',
      stripe: '#e4e9f0',
    },
  },
];

function ThemePreview({
  active,
  label,
  option,
  onSelect,
}: {
  active: boolean;
  label: string;
  option: (typeof THEME_OPTIONS)[number];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-w-[130px] flex-1 flex-col items-center gap-3 rounded-lg border-2 px-4 py-3 text-center transition-colors sm:flex-none ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-bg text-text-muted hover:border-border-light hover:text-text'
      }`}
      aria-pressed={active}
    >
      <span
        className="relative h-12 w-20 overflow-hidden rounded-md border"
        style={{
          background: option.preview.bg,
          borderColor: option.preview.stripe,
        }}
      >
        <span
          className="absolute inset-y-0 left-0 w-4"
          style={{ background: option.preview.sidebar }}
        />
        {[9, 18, 27].map((top) => (
          <span
            key={top}
            className="absolute left-1 h-0.5 w-2 rounded-full"
            style={{
              top,
              background: option.preview.stripe,
            }}
          />
        ))}
        <span
          className="absolute left-6 right-2 top-2 h-3 rounded-[3px] border"
          style={{
            background: option.preview.card,
            borderColor: option.preview.stripe,
          }}
        />
        <span
          className="absolute bottom-2 left-6 right-2 h-5 rounded-[3px] border"
          style={{
            background: option.preview.card,
            borderColor: option.preview.stripe,
          }}
        >
          <span
            className="absolute left-1 top-1 h-0.5 w-6 rounded-full"
            style={{ background: option.preview.accent }}
          />
          <span
            className="absolute left-1 top-3 h-0.5 w-4 rounded-full"
            style={{ background: option.preview.stripe }}
          />
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <Icon name={option.value === 'dark' ? 'moon' : 'sun'} size={13} />
        {label}
      </span>
    </button>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Render account profile, password, and light/dark appearance settings. */
export function SettingsPage() {
  const { i18n, t } = useTranslation();
  const { changePassword, updateProfile, user } = useAuth();
  const { setTheme, theme } = useTheme();

  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [profileStatus, setProfileStatus] = useState<Status>({ kind: 'idle' });
  const [passwordStatus, setPasswordStatus] = useState<Status>({
    kind: 'idle',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profileStatus.kind !== 'success') return;
    const handle = window.setTimeout(
      () => setProfileStatus({ kind: 'idle' }),
      2500,
    );
    return () => window.clearTimeout(handle);
  }, [profileStatus]);

  useEffect(() => {
    if (passwordStatus.kind !== 'success') return;
    const handle = window.setTimeout(
      () => setPasswordStatus({ kind: 'idle' }),
      2500,
    );
    return () => window.clearTimeout(handle);
  }, [passwordStatus]);

  const email = user?.email ?? '';
  const currentLanguage = normalizeLanguage(
    i18n.resolvedLanguage ?? i18n.language,
  );
  const displayName = name.trim() || email.split('@')[0] || t('Account');
  const initial = displayName.trim().charAt(0).toUpperCase() || 'A';
  const cleanUsername = username.trim();

  const profileChanged = useMemo(
    () =>
      name.trim() !== (user?.name ?? '').trim() ||
      cleanUsername !== (user?.username ?? '').trim(),
    [cleanUsername, name, user?.name, user?.username],
  );

  const passwordsMismatch =
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword !== confirmPassword;

  const passwordFormReady =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setProfileStatus({
        kind: 'error',
        message: t('Display name is required.'),
      });
      return;
    }
    if (!cleanUsername) {
      setProfileStatus({
        kind: 'error',
        message: t('Username is required.'),
      });
      return;
    }

    setSavingProfile(true);
    setProfileStatus({ kind: 'idle' });
    try {
      const updated = await updateProfile({
        name: name.trim(),
        username: cleanUsername,
      });
      setName(updated.name ?? '');
      setUsername(updated.username ?? '');
      setProfileStatus({
        kind: 'success',
        message: t('Profile saved.'),
      });
    } catch (err) {
      setProfileStatus({
        kind: 'error',
        message: errorMessage(err, t('Something went wrong.')),
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordStatus({
        kind: 'error',
        message: t('Fill out all password fields.'),
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        kind: 'error',
        message: t('Passwords do not match.'),
      });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({
        kind: 'error',
        message: t('Password must be at least 8 characters.'),
      });
      return;
    }

    setSavingPassword(true);
    setPasswordStatus({ kind: 'idle' });
    try {
      await changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({
        kind: 'success',
        message: t('Password updated.'),
      });
    } catch (err) {
      setPasswordStatus({
        kind: 'error',
        message: errorMessage(err, t('Something went wrong.')),
      });
    } finally {
      setSavingPassword(false);
    }
  }

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    void i18n.changeLanguage(event.target.value as AppLanguage);
  }

  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-text">
          {t('Account settings')}
        </h2>
        <p className="text-xs text-text-muted">
          {t('Manage your account details and preferred appearance.')}
        </p>
      </div>

      <Card className="gap-5 p-5">
        <div>
          <h3 className="text-sm font-semibold text-text">{t('Profile')}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {t('These details identify your ChargeTrail account.')}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Avatar className="size-14 border-2 border-border">
            <AvatarImage src={user?.image ?? undefined} alt={displayName} />
            <AvatarFallback className="bg-logo-tile text-xl font-bold text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text">
              {displayName}
            </div>
            <div className="truncate text-xs text-text-muted">
              {cleanUsername ? `@${cleanUsername}` : email}
            </div>
          </div>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleProfileSubmit}>
          <Field
            id="settings-display-name"
            label={t('Display name')}
            icon="user"
            value={name}
            placeholder={t('Your name')}
            autoComplete="name"
            onChange={setName}
          />
          <Field
            id="settings-username"
            label={t('Username')}
            icon="atSign"
            value={username}
            placeholder={t('username')}
            autoComplete="username"
            onChange={setUsername}
          />
          <Field
            id="settings-email"
            label={t('Email')}
            icon="mail"
            value={email}
            type="email"
            autoComplete="email"
            disabled
          />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={savingProfile || !profileChanged}>
              {savingProfile ? <Spinner size={13} /> : <Icon name="check" />}
              {t('Save profile')}
            </Button>
            <StatusLine status={profileStatus} />
          </div>
        </form>
      </Card>

      <Card className="gap-5 p-5">
        <div>
          <h3 className="text-sm font-semibold text-text">
            {t('Change password')}
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            {t('Use your current password to set a new one.')}
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handlePasswordSubmit}>
          <div className="relative">
            <Field
              id="settings-current-password"
              label={t('Current password')}
              icon="lock"
              value={currentPassword}
              type={showPasswords ? 'text' : 'password'}
              placeholder="********"
              autoComplete="current-password"
              onChange={setCurrentPassword}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((value) => !value)}
              className="absolute bottom-[9px] right-3 text-text-dim hover:text-text-muted"
              aria-label={
                showPasswords ? t('Hide passwords') : t('Show passwords')
              }
            >
              <Icon name={showPasswords ? 'eyeOff' : 'eye'} size={15} />
            </button>
          </div>
          <Field
            id="settings-new-password"
            label={t('New password')}
            icon="lock"
            value={newPassword}
            type={showPasswords ? 'text' : 'password'}
            placeholder={t('Minimum 8 characters')}
            autoComplete="new-password"
            onChange={setNewPassword}
          />
          <Field
            id="settings-confirm-new-password"
            label={t('Confirm new password')}
            icon="lock"
            value={confirmPassword}
            type={showPasswords ? 'text' : 'password'}
            placeholder={t('Repeat new password')}
            autoComplete="new-password"
            onChange={setConfirmPassword}
            error={passwordsMismatch ? t('Passwords do not match.') : undefined}
          />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="submit"
              disabled={savingPassword || !passwordFormReady}
            >
              {savingPassword ? <Spinner size={13} /> : <Icon name="lock" />}
              {t('Update password')}
            </Button>
            <StatusLine status={passwordStatus} />
          </div>
        </form>
      </Card>

      <Card className="gap-5 p-5">
        <div>
          <h3 className="text-sm font-semibold text-text">{t('Appearance')}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {t('Choose your preferred color scheme and language.')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {THEME_OPTIONS.map((option) => (
            <ThemePreview
              key={option.value}
              option={option}
              label={t(option.label)}
              active={theme === option.value}
              onSelect={() => setTheme(option.value)}
            />
          ))}
        </div>

        <div className="border-t border-border pt-5">
          <label
            htmlFor="settings-language"
            className="mb-1.5 block text-xs font-medium text-text-muted"
          >
            {t('Language')}
          </label>
          <select
            id="settings-language"
            value={currentLanguage}
            onChange={handleLanguageChange}
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text outline-hidden transition-colors hover:border-border-light focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-64"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-text-muted">
            {t('Choose the language used by this browser.')}
          </p>
        </div>
      </Card>
    </div>
  );
}
