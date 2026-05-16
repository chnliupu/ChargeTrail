import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type * as React from 'react';
import { Spinner } from '../../components/ui/spinner';
import { formatBucketLabel, type Bucket, type GroupBy } from './aggregations';

type SummaryBarChartProps = {
  data: Bucket[];
  /** Which numeric column of each bucket to plot. */
  valueKey: 'kwh' | 'cost';
  groupBy: GroupBy;
  color: string;
  formatValue: (n: number) => string;
  height?: number;
  isLoading?: boolean;
};

type TooltipPayload = TooltipContentProps<number, string>;

/**
 * Single-series bar chart used for the Summary energy/cost view. Themed via
 * the inline `color` prop (a CSS-variable-resolved hex from the active theme)
 * so it tracks dark/light theme switching at the page level.
 */
export function SummaryBarChart({
  data,
  valueKey,
  groupBy,
  color,
  formatValue,
  height = 240,
  isLoading = false,
}: SummaryBarChartProps) {
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height }}
        role="status"
        aria-label="Loading chart"
      >
        <Spinner size={28} className="text-text-muted" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-text-muted"
        style={{ height }}
      >
        No data for this period
      </div>
    );
  }

  return (
    <div className="min-w-0" style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid
            stroke="var(--es-border)"
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="key"
            tickFormatter={(k: string) => formatBucketLabel(k, groupBy)}
            tick={{ fill: 'var(--es-text-dim)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--es-border)' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: 'var(--es-text-dim)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: 'var(--es-bg-card-hover)', opacity: 0.5 }}
            content={
              ((props: TooltipPayload) => (
                <ChartTooltip
                  {...props}
                  color={color}
                  groupBy={groupBy}
                  formatValue={formatValue}
                />
              )) as unknown as React.ComponentProps<typeof Tooltip>['content']
            }
          />
          <Bar dataKey={valueKey} fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type ChartTooltipProps = TooltipPayload & {
  color: string;
  groupBy: GroupBy;
  formatValue: (n: number) => string;
};

function ChartTooltip({
  active,
  payload,
  color,
  groupBy,
  formatValue,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const bucket = point.payload as Bucket | undefined;
  if (!bucket) return null;
  const raw = point.value;
  const value =
    typeof raw === 'number' ? raw : Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value)) return null;
  return (
    <div className="rounded-md border border-border-light bg-card px-3 py-1.5 text-xs shadow-lg">
      <div className="text-[11px] text-text-muted">
        {formatBucketLabel(bucket.key, groupBy)}
      </div>
      <div className="font-medium" style={{ color }}>
        {formatValue(value)}
      </div>
    </div>
  );
}
