import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectors, useSyncConnector } from '../../api/hooks';
import type { ConnectorWithCount } from '../../api/connectors';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { Icon } from '../../components/Icon';
import { ProviderLogo } from '../../lib/ProviderLogo';
import { formatRelative } from '../../lib/format';
import { PROVIDER_META, errorMessage } from './shared';
import { AddConnectorDialog } from './AddConnectorDialog';
import { EditConnectorDialog } from './EditConnectorDialog';
import { DeleteConnectorDialog } from './DeleteConnectorDialog';

type SyncFlash = {
  connectorId: string;
  imported: number;
};

type SyncAllSummary = {
  succeeded: string[];
  failed: { id: string; label: string; reason: string }[];
};

export function ConnectorsPage() {
  const { i18n, t } = useTranslation();
  const list = useConnectors({ withSessionCount: true });
  const syncMutation = useSyncConnector();
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const connectors = useMemo(() => list.data?.connectors ?? [], [list.data]);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ConnectorWithCount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectorWithCount | null>(
    null,
  );

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const [syncFlash, setSyncFlash] = useState<SyncFlash | null>(null);
  const [syncAllRunning, setSyncAllRunning] = useState(false);
  const [syncAllSummary, setSyncAllSummary] = useState<SyncAllSummary | null>(
    null,
  );

  // Auto-clear the "imported N" flash after a few seconds.
  useEffect(() => {
    if (!syncFlash) return;
    const handle = window.setTimeout(() => setSyncFlash(null), 4000);
    return () => window.clearTimeout(handle);
  }, [syncFlash]);

  async function handleSync(c: ConnectorWithCount) {
    setSyncingId(c.id);
    setSyncErrors((m) => {
      if (!(c.id in m)) return m;
      const rest = { ...m };
      delete rest[c.id];
      return rest;
    });
    try {
      const result = await syncMutation.mutateAsync({ id: c.id });
      // sessionsInserted is the canonical "newly imported" count from the
      // backend's sync handler; fall back to imported for older shapes.
      const imported = result.sessionsInserted ?? result.imported ?? 0;
      setSyncFlash({ connectorId: c.id, imported });
    } catch (err) {
      setSyncErrors((m) => ({
        ...m,
        [c.id]: errorMessage(err, t('Something went wrong.')),
      }));
    } finally {
      setSyncingId(null);
    }
  }

  async function handleSyncAll() {
    setSyncAllRunning(true);
    setSyncAllSummary(null);
    const succeeded: string[] = [];
    const failed: SyncAllSummary['failed'] = [];
    for (const c of connectors) {
      setSyncingId(c.id);
      try {
        await syncMutation.mutateAsync({ id: c.id });
        succeeded.push(c.providerUsername);
      } catch (err) {
        failed.push({
          id: c.id,
          label: `${PROVIDER_META[c.provider]?.label ?? c.provider} (${c.providerUsername})`,
          reason: errorMessage(err, t('Something went wrong.')),
        });
      }
    }
    setSyncingId(null);
    setSyncAllRunning(false);
    setSyncAllSummary({ succeeded, failed });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">
            {t('Connectors')}
          </h2>
          <p className="text-xs text-text-muted">
            {t(
              'Provider sessions are pulled on demand. Add a connector to start syncing.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connectors.length > 0 && (
            <Button
              variant="secondary"
              onClick={handleSyncAll}
              disabled={syncAllRunning || syncingId !== null}
            >
              {syncAllRunning ? <Spinner /> : <Icon name="sync" size={14} />}
              {syncAllRunning ? t('Syncing all…') : t('Sync all')}
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={14} />
            {t('Add Connector')}
          </Button>
        </div>
      </div>

      {/* Sync-all summary banner */}
      {syncAllSummary && (
        <Card className="flex items-start gap-3 border-border-light p-4 text-sm">
          <Icon
            name={syncAllSummary.failed.length === 0 ? 'check' : 'alert'}
            size={16}
            className={
              syncAllSummary.failed.length === 0
                ? 'text-accent-green'
                : 'text-accent-amber'
            }
          />
          <div className="flex-1 space-y-1">
            <div className="font-medium text-text">
              {t('Synced {{succeeded}} of {{total}} connectors', {
                succeeded: syncAllSummary.succeeded.length,
                total:
                  syncAllSummary.succeeded.length +
                  syncAllSummary.failed.length,
              })}
            </div>
            {syncAllSummary.failed.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-text-muted">
                {syncAllSummary.failed.map((f) => (
                  <li key={f.id}>
                    <span className="text-text">{f.label}</span> — {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSyncAllSummary(null)}
            className="rounded p-1 text-text-dim hover:text-text"
            aria-label={t('Dismiss')}
          >
            <Icon name="x" size={14} />
          </button>
        </Card>
      )}

      {/* Loading / error states */}
      {list.isLoading && (
        <Card className="p-8 text-center text-sm text-text-muted">
          <Spinner className="mx-auto mb-3" /> {t('Loading connectors…')}
        </Card>
      )}
      {list.isError && (
        <Card className="p-6 text-sm text-error">
          {t('Failed to load connectors: {{message}}', {
            message: errorMessage(list.error, t('Something went wrong.')),
          })}
        </Card>
      )}

      {/* Empty state */}
      {!list.isLoading && !list.isError && connectors.length === 0 && (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Icon name="connector" size={28} className="text-text-dim" />
          <p className="text-sm text-text-muted">
            {t('No connectors yet. Add one to start syncing.')}
          </p>
          <Button onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={14} />
            {t('Add Connector')}
          </Button>
        </Card>
      )}

      {/* Connector rows */}
      {connectors.length > 0 && (
        <div className="flex flex-col gap-3">
          {connectors.map((c) => {
            const meta = PROVIDER_META[c.provider];
            const isSyncing = syncingId === c.id;
            const flash = syncFlash?.connectorId === c.id ? syncFlash : null;
            const rowError = syncErrors[c.id];
            const sessionCount = c.sessionCount ?? 0;
            return (
              <Card
                key={c.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                {/* Provider tile */}
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px] sm:self-center"
                  style={{
                    background: `${meta?.color ?? '#999'}1c`,
                    border: `1px solid ${meta?.color ?? '#999'}40`,
                  }}
                >
                  <ProviderLogo
                    provider={c.provider}
                    size={16}
                    className="opacity-90"
                  />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text">
                      {meta?.label ?? c.provider}
                    </span>
                    <span className="truncate text-xs text-text-dim">
                      {c.providerUsername}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-text-muted">
                    <span>
                      {t('{{count}} session', { count: sessionCount })}
                    </span>
                    <span>
                      {c.lastSyncedAt
                        ? t('Last synced {{time}}', {
                            time: formatRelative(c.lastSyncedAt, locale),
                          })
                        : t('Never synced')}
                    </span>
                  </div>
                  {flash && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-accent-green">
                      <Icon name="check" size={12} />
                      {t('Sync complete — {{result}}', {
                        result: t('{{count}} new session imported', {
                          count: flash.imported,
                        }),
                      })}
                    </div>
                  )}
                  {rowError && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-error">
                      <Icon name="alert" size={12} /> {rowError}
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="flex flex-wrap justify-end gap-2 sm:shrink-0 sm:flex-nowrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSync(c)}
                    disabled={isSyncing || syncAllRunning}
                  >
                    {isSyncing ? (
                      <Spinner size={12} />
                    ) : (
                      <Icon name="sync" size={12} />
                    )}
                    {isSyncing ? t('Syncing…') : t('Sync')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditTarget(c)}
                    disabled={syncAllRunning}
                  >
                    <Icon name="edit" size={12} />
                    {t('Edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('Delete connector')}
                    onClick={() => setDeleteTarget(c)}
                    disabled={syncAllRunning}
                    className="border border-border text-error hover:bg-error/10 hover:text-error"
                  >
                    <Icon name="trash" size={12} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div>
        <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          {t('How it works')}
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            {
              step: '01',
              title: t('Get your session token'),
              body: t(
                "Sign in to the provider's web portal and copy the Cookie and User-Agent headers from your browser's DevTools (Network tab → any XHR request).",
              ),
            },
            {
              step: '02',
              title: t('Add the connector'),
              body: t(
                'Paste the headers here. ChargeTrail stores them and uses them on your behalf to fetch your charging history.',
              ),
            },
            {
              step: '03',
              title: t('Sync your sessions'),
              body: t(
                'Click Sync to pull recent charging sessions. Run it again any time — already-imported sessions are skipped.',
              ),
            },
          ].map((it) => (
            <Card key={it.step} className="p-4">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary opacity-60">
                {it.step}
              </div>
              <div className="mb-1 text-sm font-semibold text-text">
                {it.title}
              </div>
              <div className="text-xs leading-relaxed text-text-muted">
                {it.body}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <AddConnectorDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <EditConnectorDialog
        connector={editTarget}
        onClose={() => setEditTarget(null)}
      />
      <DeleteConnectorDialog
        connector={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
