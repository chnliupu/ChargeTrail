import { useMemo, useState } from 'react';
import { Cell, Label, Pie, PieChart, Tooltip } from 'recharts';
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

/** Selectable metric driving slice size + the value shown in the legend. */
type MetricKey = 'sessions' | 'energy' | 'cost';

type MetricDef = {
  key: MetricKey;
  label: string;
  /** Numeric `Slice` field this metric maps to. */
  dataKey: 'count' | 'kwh' | 'cost';
  fmt: (value: number) => string;
};

const METRICS: ReadonlyArray<MetricDef> = [
  { key: 'sessions', label: 'Sessions', dataKey: 'count', fmt: (v) => `${v}` },
  {
    key: 'energy',
    label: 'Energy',
    dataKey: 'kwh',
    fmt: (v) => `${v.toFixed(1)} kWh`,
  },
  {
    key: 'cost',
    label: 'Cost',
    dataKey: 'cost',
    fmt: (v) => `$${v.toFixed(2)}`,
  },
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

/** Donut breakdown of connectors with a metric toggle, hover sync + tooltip. */
export function ProviderBreakdown({
  rows,
  connectors,
  isLoading = false,
}: ProviderBreakdownProps) {
  const slices = useMemo(
    () => buildSlices(rows, connectors),
    [rows, connectors],
  );
  const [metricKey, setMetricKey] = useState<MetricKey>('sessions');
  // Slice currently hovered (in the donut OR the legend); drives the dim
  // emphasis, the legend highlight, and the dynamic center label.
  const [activeIndex, setActiveIndex] = useState<number>();

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const dataKey = metric.dataKey;
  const total = useMemo(
    () => slices.reduce((sum, s) => sum + s[dataKey], 0),
    [slices, dataKey],
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
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">By connector</h3>
        <div className="flex gap-1.5">
          {METRICS.map(({ key, label }) => {
            const active = metricKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMetricKey(key)}
                aria-pressed={active}
                className="h-7 rounded-md border px-2.5 text-[11px] transition-colors"
                style={
                  active
                    ? {
                        color: 'var(--es-accent)',
                        borderColor: 'var(--es-accent)',
                        background:
                          'color-mix(in srgb, var(--es-accent) 15%, transparent)',
                      }
                    : undefined
                }
              >
                {active ? (
                  label
                ) : (
                  <span className="text-text-muted hover:text-text">
                    {label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size={22} className="text-text-muted" />
        </div>
      ) : slices.length === 0 ? (
        <p className="text-sm text-text-muted">No data</p>
      ) : (
        // Vertical stack: centered donut on top, legend pills below.
        <div className="flex flex-col items-center gap-5">
          <ChartContainer
            config={config}
            className="mx-auto aspect-square max-h-[220px] w-full max-w-[220px]"
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
                dataKey={dataKey}
                nameKey="key"
                innerRadius="58%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="var(--es-bg-card)"
                strokeWidth={2}
                onMouseEnter={(_, i) => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(undefined)}
              >
                {slices.map((s, i) => (
                  <Cell
                    key={s.key}
                    fill={s.fill}
                    fillOpacity={
                      activeIndex === undefined || activeIndex === i ? 1 : 0.3
                    }
                    style={{ transition: 'fill-opacity 0.12s' }}
                  />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (
                      !viewBox ||
                      !('cx' in viewBox) ||
                      viewBox.cx == null ||
                      viewBox.cy == null
                    ) {
                      return null;
                    }
                    const { cx, cy } = viewBox;
                    const hovered =
                      activeIndex != null ? slices[activeIndex] : undefined;
                    const big = hovered
                      ? total > 0
                        ? `${((hovered[dataKey] / total) * 100).toFixed(0)}%`
                        : '0%'
                      : `${slices.length}`;
                    const small = hovered
                      ? hovered.providerLabel
                      : slices.length === 1
                        ? 'connector'
                        : 'connectors';
                    return (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        <tspan
                          x={cx}
                          y={cy - 6}
                          className="text-lg font-bold"
                          fill={hovered ? hovered.fill : 'var(--es-text)'}
                        >
                          {big}
                        </tspan>
                        <tspan
                          x={cx}
                          y={cy + 14}
                          className="text-[11px]"
                          fill="var(--es-text-muted)"
                        >
                          {small}
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <ConnectorLegend
            slices={slices}
            metric={metric}
            total={total}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
          />
        </div>
      )}
    </Card>
  );
}

type ConnectorLegendProps = {
  slices: readonly Slice[];
  metric: MetricDef;
  total: number;
  activeIndex: number | undefined;
  onActiveChange: (index: number | undefined) => void;
};

/** Full-width legend pills (one per connector), hover-synced with the donut. */
function ConnectorLegend({
  slices,
  metric,
  total,
  activeIndex,
  onActiveChange,
}: ConnectorLegendProps) {
  return (
    <ul className="flex w-full flex-col gap-2 text-xs">
      {slices.map((s, i) => {
        const value = s[metric.dataKey];
        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
        const active = activeIndex === i;
        return (
          <li
            key={s.key}
            onMouseEnter={() => onActiveChange(i)}
            onMouseLeave={() => onActiveChange(undefined)}
            className={
              'flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ' +
              (active
                ? 'text-text'
                : 'border-border/40 bg-card-hover/30 text-text-muted')
            }
            style={
              active
                ? {
                    background: `color-mix(in srgb, ${s.fill} 12%, transparent)`,
                    borderColor: `color-mix(in srgb, ${s.fill} 35%, transparent)`,
                  }
                : undefined
            }
          >
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
            <span className="flex-1 truncate">
              {s.providerLabel}
              {s.showAccountInLegend && s.providerUsername !== '—' ? (
                <span className="text-text-dim"> · {s.providerUsername}</span>
              ) : null}
            </span>
            <span
              className="shrink-0 font-medium tabular-nums"
              style={active ? { color: s.fill } : undefined}
            >
              {metric.fmt(value)}
            </span>
            <span className="w-12 shrink-0 text-right tabular-nums text-text-dim">
              {pct}%
            </span>
          </li>
        );
      })}
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
