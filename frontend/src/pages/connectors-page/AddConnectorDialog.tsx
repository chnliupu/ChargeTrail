import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { useAddConnector } from '../../api/hooks';
import type {
  AddConnectorInput,
  BrowserToken,
  ProviderId,
} from '../../api/connectors';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Spinner } from '../../components/ui/spinner';
import { Textarea } from '../../components/ui/textarea';
import { Icon } from '../../components/Icon';
import { ProviderLogo } from '../../lib/ProviderLogo';
import { PROVIDER_META, errorMessage } from './shared';

type AddFormState = {
  provider: ProviderId;
  providerUsername: string;
  cookie: string;
  userAgent: string;
};

const EMPTY_ADD: AddFormState = {
  provider: 'chargepoint',
  providerUsername: '',
  cookie: '',
  userAgent: '',
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddConnectorDialog({ open, onClose }: Props) {
  const { t } = useTranslation();

  // Inner form is only mounted while open, so its state resets each time.
  return (
    <Dialog open={open} onClose={onClose} title={t('Add Connector')}>
      <AddConnectorForm onClose={onClose} />
    </Dialog>
  );
}

function AddConnectorForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const addMutation = useAddConnector();
  const [form, setForm] = useState<AddFormState>(EMPTY_ADD);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const token: BrowserToken | undefined =
      form.cookie.trim() && form.userAgent.trim()
        ? {
            Cookie: form.cookie.trim(),
            'User-Agent': form.userAgent.trim(),
          }
        : undefined;
    const payload: AddConnectorInput = {
      provider: form.provider,
      providerUsername: form.providerUsername.trim(),
      ...(token ? { token } : {}),
    };
    try {
      await addMutation.mutateAsync(payload);
      onClose();
    } catch (err) {
      setError(errorMessage(err, t('Something went wrong.')));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">
          {t('Provider')}
        </label>
        <Select
          value={form.provider}
          onValueChange={(value) =>
            setForm((f) => ({ ...f, provider: value as ProviderId }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('Select a provider')} />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PROVIDER_META) as ProviderId[]).map((key) => {
              const meta = PROVIDER_META[key];
              return (
                <SelectItem key={key} value={key}>
                  <ProviderLogo provider={key} size={16} />
                  {meta.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">
          {t('Account email or username')}
        </label>
        <Input
          value={form.providerUsername}
          onChange={(e) =>
            setForm((f) => ({ ...f, providerUsername: e.target.value }))
          }
          placeholder="you@example.com"
          required
          autoFocus
        />
        <p className="mt-1 text-[11px] text-text-dim">
          {t(
            'The login you use at {{provider}}. Used to distinguish multiple accounts at the same provider.',
            {
              provider: PROVIDER_META[form.provider].label,
            },
          )}
        </p>
      </div>

      <div className="rounded-md border border-border bg-bg px-3 py-2.5">
        <p className="mb-1 text-xs font-medium text-text-muted">
          {t('How to get your token:')}
        </p>
        <ol className="list-decimal pl-5 text-[11px] leading-relaxed text-text-muted">
          <li>
            {t('Sign in to the {{provider}} web portal', {
              provider: PROVIDER_META[form.provider].label,
            })}
          </li>
          <li>{t('Open DevTools → Network tab → filter for XHR')}</li>
          <li>
            {t(
              'Click any request → Headers → copy the Cookie and User-Agent values',
            )}
          </li>
        </ol>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">
          {t('Cookie header value')}
        </label>
        <Textarea
          value={form.cookie}
          onChange={(e) => setForm((f) => ({ ...f, cookie: e.target.value }))}
          placeholder="cp_session=abc123; _ga=GA1.2.xyz..."
          rows={3}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">
          {t('User-Agent header value')}
        </label>
        <div className="flex gap-2">
          <Input
            value={form.userAgent}
            onChange={(e) =>
              setForm((f) => ({ ...f, userAgent: e.target.value }))
            }
            placeholder="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title={t("Use current browser's user agent")}
            aria-label={t("Use current browser's user agent")}
            onClick={() =>
              setForm((f) => ({ ...f, userAgent: navigator.userAgent }))
            }
          >
            <Compass />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
          <Icon name="alert" size={12} /> {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={addMutation.isPending}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="submit"
          disabled={
            addMutation.isPending ||
            !form.providerUsername.trim() ||
            Boolean(form.cookie.trim()) !== Boolean(form.userAgent.trim())
          }
        >
          {addMutation.isPending && <Spinner size={12} />}
          {t('Add connector')}
        </Button>
      </div>
    </form>
  );
}
