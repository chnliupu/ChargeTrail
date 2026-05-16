import { useMemo, useState } from 'react';
import type {
  DateRange as DayPickerDateRange,
  OnSelectHandler,
} from 'react-day-picker';
import { useConnectors, useSessionsRange } from '../../api/hooks';
import { Icon } from '../../components/Icon';
import { Calendar } from '../../components/ui/calendar';
import { Card } from '../../components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { useIsMobile } from '../../hooks/use-mobile';
import {
  bucketize,
  byConnector,
  topLocations,
  totalsOf,
  type GroupBy,
} from './aggregations';
import {
  dateRangeToIsoRange,
  formatDateRangeLabel,
  normalizeCompletedDateRange,
  type CompletedDateRange,
} from './dateRange';
import { periodToRange, type Period } from './period';
import { ProviderBreakdown } from './ProviderBreakdown';
import { StatCard } from './StatCard';
import { SummaryBarChart } from './SummaryBarChart';
import { TopLocations } from './TopLocations';

type ChartType = 'energy' | 'cost';

const PERIODS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: '30d', label: 'Last 30d' },
  { value: '90d', label: 'Last 90d' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

const GROUPS: ReadonlyArray<{ value: GroupBy; label: string }> = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

const CHART_TYPES: ReadonlyArray<{
  value: ChartType;
  label: string;
  /** CSS variable so the bar color tracks dark/light theme. */
  color: string;
}> = [
  { value: 'energy', label: 'Energy', color: 'var(--es-accent-green)' },
  { value: 'cost', label: 'Cost', color: 'var(--es-accent-amber)' },
];

export function SummaryPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [customRange, setCustomRange] = useState<CompletedDateRange>();
  const [draftRange, setDraftRange] = useState<DayPickerDateRange>();
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [chartType, setChartType] = useState<ChartType>('energy');
  const isMobile = useIsMobile();

  const presetRange = useMemo(() => periodToRange(period), [period]);
  const customIsoRange = useMemo(
    () => dateRangeToIsoRange(customRange),
    [customRange],
  );
  const range = customIsoRange ?? presetRange;
  const { data, isLoading, isError, error } = useSessionsRange(
    range ? { dateRange: range } : {},
  );
  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const truncated = data?.truncated ?? false;

  const buckets = useMemo(
    () => bucketize(sessions, groupBy),
    [sessions, groupBy],
  );
  const providers = useMemo(() => byConnector(sessions), [sessions]);
  const { data: connectorsData } = useConnectors();
  const connectors = useMemo(
    () => connectorsData?.connectors ?? [],
    [connectorsData],
  );
  const locations = useMemo(() => topLocations(sessions, 6), [sessions]);
  const totals = useMemo(() => totalsOf(sessions), [sessions]);

  const activeChart = CHART_TYPES.find((c) => c.value === chartType)!;
  const isCustomRangeActive = Boolean(customRange);
  const rangeLabel = isCustomRangeActive
    ? formatDateRangeLabel(customRange)
    : 'Range';
  const rangeStatus = !draftRange?.from
    ? 'Pick a start date'
    : draftRange.to
      ? formatDateRangeLabel(draftRange)
      : 'Pick an end date';

  function handlePeriodClick(value: Period) {
    setPeriod(value);
    setCustomRange(undefined);
    setDraftRange(undefined);
    setRangePickerOpen(false);
  }

  function handleRangePickerOpenChange(open: boolean) {
    setRangePickerOpen(open);
    if (open) {
      setDraftRange(customRange);
    }
  }

  const handleRangeSelect: OnSelectHandler<DayPickerDateRange | undefined> = (
    _nextRange,
    selectedDay,
  ) => {
    if (!draftRange?.from || draftRange.to) {
      setDraftRange({ from: selectedDay });
      return;
    }

    const completedRange = normalizeCompletedDateRange({
      from: draftRange.from,
      to: selectedDay,
    });
    setDraftRange(completedRange);
    setCustomRange(completedRange);
    setRangePickerOpen(false);
  };

  function handleClearRange() {
    setCustomRange(undefined);
    setDraftRange(undefined);
    setRangePickerOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {PERIODS.map(({ value, label }) => {
            const active = !isCustomRangeActive && period === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => handlePeriodClick(value)}
                aria-pressed={active}
                className={
                  'h-8 rounded-md border px-3 text-xs font-medium transition-colors ' +
                  (active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-text-muted hover:bg-card-hover hover:text-text')
                }
              >
                {label}
              </button>
            );
          })}
          <Popover
            open={rangePickerOpen}
            onOpenChange={handleRangePickerOpenChange}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-pressed={isCustomRangeActive}
                className={
                  'flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ' +
                  (isCustomRangeActive || rangePickerOpen
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-text-muted hover:bg-card-hover hover:text-text')
                }
              >
                <Icon name="calendar" size={13} />
                <span>{rangeLabel}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-auto overflow-hidden rounded-xl border-border-light bg-card p-0 text-text shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
            >
              <Calendar
                mode="range"
                selected={draftRange}
                onSelect={handleRangeSelect}
                numberOfMonths={2}
                captionLayout="dropdown"
                startMonth={new Date(2015, 0)}
                endMonth={new Date(new Date().getFullYear() + 1, 11)}
                className="p-4 [--cell-size:2.25rem]"
                classNames={{
                  months: 'relative flex flex-col gap-4 sm:flex-row',
                  month: 'flex w-full flex-col gap-3',
                  weekdays: 'flex border-b border-border/60 pb-2',
                  week: 'mt-2 flex w-full',
                }}
              />
              <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
                <span className="text-xs text-text-dim">{rangeStatus}</span>
                {draftRange?.from || customRange ? (
                  <button
                    type="button"
                    onClick={handleClearRange}
                    className="h-7 rounded-md border border-border bg-transparent px-3 text-xs text-text-muted transition-colors hover:border-border-light hover:text-text"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          {GROUPS.map(({ value, label }) => {
            const active = groupBy === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setGroupBy(value)}
                aria-pressed={active}
                className={
                  'h-8 rounded-md border px-3 text-xs transition-colors ' +
                  (active
                    ? 'border-border-light bg-card-hover text-text'
                    : 'border-border bg-transparent text-text-muted hover:text-text')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {isError ? (
        <Card className="p-4 text-sm text-error">
          {error instanceof Error
            ? error.message
            : 'Could not load sessions for the selected period.'}
        </Card>
      ) : null}

      {truncated ? (
        <Card className="border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          Showing the first {sessions.length.toLocaleString()} sessions for this
          period. Pick a shorter period for complete totals.
        </Card>
      ) : null}

      {/* KPI row */}
      <div
        className={
          'grid gap-3 sm:gap-3.5 ' +
          (isMobile
            ? 'grid-cols-2'
            : 'grid-cols-[repeat(auto-fit,minmax(180px,1fr))]')
        }
      >
        <StatCard
          label="Total energy"
          value={`${totals.kwh.toFixed(1)} kWh`}
          sub={`${totals.sessions} sessions`}
          accentClass="text-accent-green"
          icon="bolt"
          isLoading={isLoading}
        />
        <StatCard
          label="Total cost"
          value={`$${totals.cost.toFixed(2)}`}
          sub={`$${totals.avgCostPerSession.toFixed(2)} avg/session`}
          accentClass="text-accent-amber"
          icon="bolt"
          isLoading={isLoading}
        />
        <StatCard
          label="Avg per session"
          value={`${totals.avgKwhPerSession.toFixed(1)} kWh`}
          sub={`$${totals.avgCostPerSession.toFixed(2)} avg cost`}
          accentClass="text-primary"
          icon="bolt"
          isLoading={isLoading}
        />
        <StatCard
          label="Avg price/kWh"
          value={`$${totals.blendedPricePerKwh.toFixed(4)}`}
          sub="blended rate"
          accentClass="text-text-muted"
          icon="bolt"
          isLoading={isLoading}
        />
      </div>

      {/* Main chart */}
      <Card className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">
            {chartType === 'energy' ? 'Energy charged (kWh)' : 'Cost ($)'}
          </h3>
          <div className="flex gap-1.5">
            {CHART_TYPES.map(({ value, label, color }) => {
              const active = chartType === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChartType(value)}
                  aria-pressed={active}
                  className="h-7 rounded-md border px-3 text-xs transition-colors"
                  style={
                    active
                      ? {
                          color,
                          borderColor: color,
                          background: `color-mix(in srgb, ${color} 15%, transparent)`,
                        }
                      : undefined
                  }
                >
                  {!active ? (
                    <span className="text-text-muted hover:text-text">
                      {label}
                    </span>
                  ) : (
                    label
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <SummaryBarChart
          data={buckets}
          valueKey={chartType === 'energy' ? 'kwh' : 'cost'}
          groupBy={groupBy}
          color={activeChart.color}
          formatValue={(v) =>
            chartType === 'energy' ? `${v.toFixed(1)} kWh` : `$${v.toFixed(2)}`
          }
          height={240}
          isLoading={isLoading}
        />
      </Card>

      {/* Breakdown panels */}
      <div
        className={
          'grid gap-4 ' +
          (isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')
        }
      >
        <ProviderBreakdown
          rows={providers}
          connectors={connectors}
          isLoading={isLoading}
        />
        <TopLocations rows={locations} isLoading={isLoading} />
      </div>
    </div>
  );
}
