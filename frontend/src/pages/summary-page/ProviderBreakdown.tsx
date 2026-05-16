import { useMemo } from 'react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { ConnectorWithCount } from '../../api/connectors';
import { Card } from '../../components/ui/card';
import { ChartContainer, type ChartConfig } from '../../components/ui/chart';
import { Spinner } from '../../components/ui/spinner';
import { ProviderLogo } from '../../lib/ProviderLogo';
import { getProviderMeta } from '../../lib/providers';
import type { ConnectorRow } from './aggregations';

/**
 * Color scheme seeded from the coolors.co palette
 * `ffe74c-ff5964-ffffff-38618c-35a7ff` (pure white dropped) plus a few
 * complementary hues so each connector gets a distinct, accessible color.
 */
const COLOR_PALETTE: ReadonlyArray<string> = [
  '#35a7ff', // azure
  '#ff5964', // coral
  '#ffe74c', // butter
  '#38618c', // sapphire
  '#5fc27e', // mint
  '#b8336a', // raspberry
  '#9d4edd', // amethyst
  '#f4a261', // tangerine
  '#2ec4b6', // teal
  '#e76f51', // sienna
];

type ProviderBreakdownProps = {
  rows: ConnectorRow[];
  connectors: readonly ConnectorWithCount[];
  isLoading?: boolean;
};

type Slice = {
  /** Stable key used as the dataKey/nameKey for chart segments. */
  key: string;
  /** Canonical provider id resolved via `getProviderMeta`. */
  providerId: string;
  /** Provider display label from `PROVIDER_META` (e.g. "ChargePoint"). */
  providerLabel: string;
  /** Account login displayed in tooltip; falls back to "—". */
  providerUsername: string;
  /** Whether the legend should append the username to disambiguate. */
  showAccountInLegend: boolean;
  kwh: number;
  cost: number;
  count: number;
  /** Blended average price per kWh (cost / kWh). `null` when kWh is 0. */
  avgPricePerKwh: number | null;
  fill: string;
};

/** Build pie slices, joining aggregation rows with connector metadata. */
function buildSlices(
  rows: readonly ConnectorRow[],
  connectors: readonly ConnectorWithCount[],
): Slice[] {
  const byId = new Map(connectors.map((c) => [c.id, c]));
  // Count rows per provider so we know whether to show the username in the
  // legend (only needed when multiple connectors share a provider).
  const providerRowCount = new Map<string, number>();
  for (const row of rows) {
    const meta = getProviderMeta(row.provider);
    providerRowCount.set(
      String(meta.id),
      (providerRowCount.get(String(meta.id)) ?? 0) + 1,
    );
  }
  return rows.map((row, i) => {
    const connector = row.connectorId ? byId.get(row.connectorId) : undefined;
    const username = connector?.providerUsername ?? '';
    const meta = getProviderMeta(row.provider);
    const providerId = String(meta.id);
    return {
      // Stable key per connector id (or sentinel for "no connector").
      key: row.connectorId ?? '__no_connector__',
      providerId,
      providerLabel: meta.label,
      providerUsername: username || '—',
      showAccountInLegend: (providerRowCount.get(providerId) ?? 0) > 1,
      kwh: row.kwh,
      cost: row.cost,
      count: row.count,
      avgPricePerKwh: row.kwh > 0 ? row.cost / row.kwh : null,
      fill: COLOR_PALETTE[i % COLOR_PALETTE.length],
    };
  });
}

/** Pie chart breakdown of sessions by connector with hover tooltip + legend. */
export function ProviderBreakdown({
  rows,
  connectors,
  isLoading = false,
}: ProviderBreakdownProps) {
  const slices = useMemo(
    () => buildSlices(rows, connectors),
    [rows, connectors],
  );

  // ChartConfig drives the shadcn theming for chart segments.
  const config = useMemo<ChartConfig>(() => {
    const c: ChartConfig = {};
    for (const s of slices) {
      c[s.key] = { label: s.providerLabel, color: s.fill };
    }
    return c;
  }, [slices]);

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-text">By connector</h3>
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size={22} className="text-text-muted" />
        </div>
      ) : slices.length === 0 ? (
        <p className="text-sm text-text-muted">No data</p>
      ) : (
        // Flex row so the legend sits at the top-right of the pie chart.
        <div className="flex items-start gap-4">
          <ChartContainer
            config={config}
            className="aspect-square max-h-[260px] min-w-0 flex-1"
          >
            <PieChart>
              <Tooltip
                cursor={false}
                content={
                  ConnectorTooltipContent as unknown as React.ComponentProps<
                    typeof Tooltip
                  >['content']
                }
              />
              <Pie
                data={slices}
                dataKey="count"
                nameKey="key"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="var(--es-bg-card)"
                strokeWidth={2}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ConnectorLegend slices={slices} />
        </div>
      )}
    </Card>
  );
}

/** Vertically stacked legend pinned to the top-right of the pie. */
function ConnectorLegend({ slices }: { slices: readonly Slice[] }) {
  return (
    <ul className="flex shrink-0 flex-col gap-2 pt-1 text-xs">
      {slices.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: s.fill }}
            aria-hidden="true"
          />
          <ProviderLogo
            provider={s.providerId}
            size={14}
            className="shrink-0 text-text-muted"
          />
          <span className="text-text">
            {s.providerLabel}
            {s.showAccountInLegend && s.providerUsername !== '—' ? (
              <span className="text-text-muted"> · {s.providerUsername}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tooltip body listing providerUsername, kWh, $, sessions, avg $/kWh. */
function ConnectorTooltipContent(
  props: TooltipContentProps<number, string>,
): React.ReactElement | null {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0]?.payload as Slice | undefined;
  if (!slice) return null;
  return (
    <div
      role="tooltip"
      className="rounded-md border border-border-light bg-card px-3 py-2 text-xs shadow-lg"
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: slice.fill }}
        />
        <ProviderLogo
          provider={slice.providerId}
          size={14}
          className="text-text-muted"
        />
        <span className="font-medium text-text">{slice.providerLabel}</span>
      </div>
      <div className="mb-1 text-[11px] text-text-muted">
        {slice.providerUsername}
      </div>
      <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-text-muted">Energy</span>
        <span className="text-right text-accent-green">
          {slice.kwh.toFixed(1)} kWh
        </span>
        <span className="text-text-muted">Cost</span>
        <span className="text-right text-accent-amber">
          ${slice.cost.toFixed(2)}
        </span>
        <span className="text-text-muted">Sessions</span>
        <span className="text-right text-text">{slice.count}</span>
        <span className="text-text-muted">Avg $/kWh</span>
        <span className="text-right text-text">
          {slice.avgPricePerKwh != null
            ? `$${slice.avgPricePerKwh.toFixed(3)}`
            : '—'}
        </span>
      </div>
    </div>
  );
}
