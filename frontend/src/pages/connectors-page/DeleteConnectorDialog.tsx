import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeleteConnector } from '../../api/hooks';
import type { ConnectorWithCount } from '../../api/connectors';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { Icon } from '../../components/Icon';
import { PROVIDER_META, errorMessage } from './shared';

type Props = {
  connector: ConnectorWithCount | null;
  onClose: () => void;
};

export function DeleteConnectorDialog({ connector, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={connector !== null}
      onClose={onClose}
      title={t('Delete connector?')}
    >
      {connector && (
        // Key remounts the body when switching between connectors so the
        // checkbox + error state reset to defaults for each target.
        <DeleteConnectorBody
          key={connector.id}
          connector={connector}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function DeleteConnectorBody({
  connector,
  onClose,
}: {
  connector: ConnectorWithCount;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteConnector();
  const [removeSessions, setRemoveSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionCount = connector.sessionCount ?? 0;

  async function confirm() {
    setError(null);
    try {
      await deleteMutation.mutateAsync({
        id: connector.id,
        removeSessions,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t('Something went wrong.')));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text">
        {t('Remove the {{provider}} connector for {{account}}?', {
          provider:
            PROVIDER_META[connector.provider]?.label ?? connector.provider,
          account: connector.providerUsername,
        })}
      </p>
      <label className="flex items-start gap-2 rounded-md border border-border bg-bg px-3 py-2.5">
        <input
          type="checkbox"
          checked={removeSessions}
          onChange={(e) => setRemoveSessions(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-error)]"
        />
        <span className="text-sm">
          <span className="block text-text">
            {t('Also delete {{count}} imported session', {
              count: sessionCount,
            })}
          </span>
          <span className="block text-[11px] text-text-muted">
            {t(
              'If unchecked, sessions are kept and shown without a provider link.',
            )}
          </span>
        </span>
      </label>
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
          <Icon name="alert" size={12} /> {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={deleteMutation.isPending}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={confirm}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending && <Spinner size={12} />}
          {t('Delete connector')}
        </Button>
      </div>
    </div>
  );
}
