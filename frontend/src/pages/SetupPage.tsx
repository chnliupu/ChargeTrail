import { Bolt, Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/spinner';
import { useAuth } from '../auth/useAuth';

type SetupFieldProps = {
  label: string;
  type: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  suffix?: ReactNode;
  onChange: (value: string) => void;
};

function SetupField({
  label,
  type,
  value,
  placeholder,
  autoComplete,
  suffix,
  onChange,
}: SetupFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-text-muted">
        {label}
      </span>
      <span className="flex h-[42px] items-center rounded-md border border-border bg-bg px-3 focus-within:border-primary">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-dim"
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix}
      </span>
    </label>
  );
}

type LocationState = { from?: { pathname?: string } };

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, needsSetup, setupAdmin, user } = useAuth();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const redirectTo =
    (location.state as LocationState | null)?.from?.pathname ?? '/data';

  if (isLoading && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-text-muted">
        <span className="inline-flex items-center gap-2 text-sm">
          <Spinner />
          {t('Loading setup...')}
        </span>
      </div>
    );
  }

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (!isLoading && !needsSetup) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !trimmedUsername || !password) {
      setError(t('Please enter your email, username, and password.'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('Passwords do not match.'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await setupAdmin({
        email: trimmedEmail,
        username: trimmedUsername,
        password,
        name: trimmedName || undefined,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Setup failed. Please try again.'),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-10 text-text">
      <div className="absolute inset-0 bg-login-grid opacity-[0.04]" />

      <section className="relative w-full max-w-[400px]">
        <div className="mb-9 text-center">
          <div className="mb-2 inline-flex items-center gap-2.5">
            <div className="flex size-[38px] items-center justify-center rounded-[10px] border border-primary/30 bg-logo-tile text-primary">
              <Bolt size={18} fill="currentColor" />
            </div>
            <h1 className="text-[22px] font-bold leading-none text-text">
              ChargeTrail
            </h1>
          </div>
          <p className="text-[13px] text-text-muted">
            {t('Your EV charging data, centralized.')}
          </p>
        </div>

        <div className="rounded-[14px] border border-border-light bg-card px-7 py-8 shadow-login">
          <h2 className="mb-2 text-[17px] font-semibold text-text">
            {t('Create the first admin account')}
          </h2>
          <p className="mb-[22px] text-[13px] text-text-muted">
            {t(
              'No admin exists yet. Finish setup by creating the first admin user for this instance.',
            )}
          </p>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <SetupField
              label={t('Email')}
              type="email"
              value={email}
              placeholder={t('you@example.com')}
              autoComplete="email"
              onChange={setEmail}
            />
            <SetupField
              label={t('Username')}
              type="text"
              value={username}
              placeholder={t('admin')}
              autoComplete="username"
              onChange={setUsername}
            />
            <SetupField
              label={t('Display name')}
              type="text"
              value={name}
              placeholder={t('Optional')}
              autoComplete="name"
              onChange={setName}
            />
            <SetupField
              label={t('Password')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              placeholder="********"
              autoComplete="new-password"
              onChange={setPassword}
              suffix={
                <button
                  type="button"
                  className="ml-3 flex text-text-dim hover:text-text-muted"
                  aria-label={
                    showPassword ? t('Hide password') : t('Show password')
                  }
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />
            <SetupField
              label={t('Confirm password')}
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              placeholder="********"
              autoComplete="new-password"
              onChange={setConfirmPassword}
            />

            {error ? <p className="text-xs text-error">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-[42px] items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground opacity-100 hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  {t('Creating account...')}
                </>
              ) : (
                t('Create admin account')
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
