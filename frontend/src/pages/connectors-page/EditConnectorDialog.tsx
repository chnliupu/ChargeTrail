import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { useUpdateConnector } from '../../api/hooks';
import type { BrowserToken, ConnectorWithCount } from '../../api/connectors';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import { Textarea } from '../../components/ui/textarea';
import { Icon } from '../../components/Icon';
import { PROVIDER_META, errorMessage } from './shared';

type EditFormState = {
  providerUsername: string;
  cookie: string;
  userAgent: string;
};

type Props = {
  connector: ConnectorWithCount | null;
  onClose: () => void;
};

export function EditConnectorDialog({ connector, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={connector !== null}
      onClose={onClose}
      title={
        connector
          ? t('Edit {{provider}}', {
              provider:
                PROVIDER_META[connector.provider]?.label ?? connector.provider,
            })
          : t('Edit')
      }
    >
      {connector && (
        // Key remounts the form when switching between connectors, so the
        // initial state below picks up the new connector's username.
        <EditConnectorForm
          key={connector.id}
          connector={connector}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function EditConnectorForm({
  connector,
  onClose,
}: {
  connector: ConnectorWithCount;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const updateMutation = useUpdateConnector();
  // We deliberately do NOT prefill the token: the server-stored value is not
  // echoed back, and any value the user types in is treated as a replacement.
  // Empty fields mean "leave the stored token alone".
  const [form, setForm] = useState<EditFormState>({
    providerUsername: connector.providerUsername,
    cookie: '',
    userAgent: '',
  });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const patch: { providerUsername?: string; token?: BrowserToken } = {};
    const trimmedUser = form.providerUsername.trim();
    if (trimmedUser && trimmedUser !== connector.providerUsername) {
      patch.providerUsername = trimmedUser;
    }
    const cookie = form.cookie.trim();
    const ua = form.userAgent.trim();
    if (cookie || ua) {
      if (!cookie || !ua) {
        setError(
          t('Cookie and User-Agent must both be provided to update the token.'),
        );
        return;
      }
      patch.token = { Cookie: cookie, 'User-Agent': ua };
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: connector.id, input: patch });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t('Something went wrong.')));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-bg px-3 py-2 text-[11px] text-text-muted">
        {t(
          'Provider is fixed for an existing connector. To switch providers, add a new connector instead.',
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">
          {t('Account email or username')}
        </label>
        <Input
          value={form.providerUsername}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              providerUsername: e.target.value,
            }))
          }
          required
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">
          {t('Cookie header value')}{' '}
          <span className="text-[10px] font-normal text-text-dim">
            {t('(leave blank to keep the stored value)')}
          </span>
        </label>
        <Textarea
          value={form.cookie}
          onChange={(e) => setForm((f) => ({ ...f, cookie: e.target.value }))}
          placeholder="●●●●●●●●●●●●●● (current value not shown)"
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
            placeholder="●●●●●●●●●●●●●● (current value not shown)"
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
          disabled={updateMutation.isPending}
        >
          {t('Cancel')}
        </Button>
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Spinner size={12} />}
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}
