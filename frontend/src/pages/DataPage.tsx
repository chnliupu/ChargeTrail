import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import type {
  DateRange as DayPickerDateRange,
  OnSelectHandler,
} from 'react-day-picker';
import { useConnectors, useSessionsRange } from '../api/hooks';
import type { ConnectorWithCount } from '../api/connectors';
import type { Session } from '../api/sessions';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Calendar } from '../components/ui/calendar';
import { Card } from '../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { Icon } from '../components/Icon';
import { useIsMobile } from '../hooks/use-mobile';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatTimeOfDay,
} from '../lib/format';
import { ProviderLogo } from '../lib/ProviderLogo';
import { getProviderMeta } from '../lib/providers';
import {
  dateRangeToIsoRange,
  formatDateRangeLabel,
  normalizeCompletedDateRange,
  type CompletedDateRange,
} from './summary-page/dateRange';
import { periodToRange, type Period } from './summary-page/period';

const PAGE_SIZE = 25;

const PERIODS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: '30d', label: 'Last 30d' },
  { value: '90d', label: 'Last 90d' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

type SortKey =
  | 'startedAt'
  | 'provider'
  | 'address1'
  | 'durationSeconds'
  | 'powerKwh'
  | 'price';
type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'startedAt', label: 'Date & Time' },
  { key: 'provider', label: 'Provider' },
  { key: 'address1', label: 'Location' },
  { key: 'durationSeconds', label: 'Duration' },
  { key: 'powerKwh', label: 'Energy' },
  { key: 'price', label: 'Cost' },
];

type ProviderOption = {
  connectorId: string;
  label: string;
};

/**
 * Build the dropdown filter options from the user's configured connectors.
 * When multiple connectors share the same provider id, the provider username
 * is appended so the user can tell them apart.
 */
function buildProviderOptions(
  connectors: ConnectorWithCount[],
): ProviderOption[] {
  const counts = new Map<string, number>();
  for (const c of connectors) {
    counts.set(c.provider, (counts.get(c.provider) ?? 0) + 1);
  }
  return connectors.map((c) => {
    const meta = getProviderMeta(c.provider);
    const needsSuffix = (counts.get(c.provider) ?? 0) > 1;
    return {
      connectorId: c.id,
      label: needsSuffix ? `${meta.label} - ${c.providerUsername}` : meta.label,
    };
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function sortValueFor(s: Session, key: SortKey): unknown {
  if (key === 'startedAt') return new Date(s.startedAt).getTime();
  return s[key];
}

type DetailField = { label: string; value: string; mono?: boolean };

/** Build the labeled detail fields shown in the expanded session view. */
function getDetailFields(s: Session): DetailField[] {
  return [
    {
      label: 'Session ID',
      value: s.providerSessionId ?? '—',
      mono: true,
    },
    {
      label: 'Price / kWh',
      value: s.pricePerKwh != null ? `$${s.pricePerKwh.toFixed(4)}` : '—',
    },
    {
      label: 'Price / hour',
      value: s.pricePerHour != null ? `$${s.pricePerHour.toFixed(2)}` : '—',
    },
    { label: 'Currency', value: s.currency ?? '—' },
    { label: 'Device', value: s.deviceName ?? '—' },
    {
      label: 'Ended at',
      value: s.endedAt ? formatDateTime(s.endedAt) : '—',
    },
    {
      label: 'Coordinates',
      value:
        s.lat != null && s.lon != null
          ? `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`
          : '—',
    },
    { label: 'Connector', value: s.connectorId ?? '—' },
  ];
}

function DetailGrid({ session }: { session: Session }) {
  return (
    <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
      {getDetailFields(session).map((f) => (
        <div key={f.label} className="min-w-0">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-text-dim">
            {f.label}
          </div>
          <div
            className={`truncate text-text-muted ${
              f.mono ? 'font-mono text-[11px]' : 'text-xs'
            }`}
            title={f.value}
          >
            {f.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProviderBadge({ provider }: { provider: string | null | undefined }) {
  const meta = getProviderMeta(provider);
  return (
    <Badge variant={meta.variant} className="gap-1.5 pl-1.5">
      <ProviderLogo
        provider={provider}
        size={13}
        className="size-3.5 shrink-0"
      />
      <span>{meta.label}</span>
    </Badge>
  );
}

export function DataPage() {
  // --- Date-range selector (ported from SummaryPage) -----------------------
  const [period, setPeriod] = useState<Period>('30d');
  const [customRange, setCustomRange] = useState<CompletedDateRange>();
  const [draftRange, setDraftRange] = useState<DayPickerDateRange>();
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  const presetRange = useMemo(() => periodToRange(period), [period]);
  const customIsoRange = useMemo(
    () => dateRangeToIsoRange(customRange),
    [customRange],
  );
  const range = customIsoRange ?? presetRange;
  const isCustomRangeActive = Boolean(customRange);
  const rangeLabel = isCustomRangeActive
    ? formatDateRangeLabel(customRange)
    : 'Range';
  const rangeStatus = !draftRange?.from
    ? 'Pick a start date'
    : draftRange.to
      ? formatDateRangeLabel(draftRange)
      : 'Pick an end date';

  // --- Data ----------------------------------------------------------------
  const { data, isLoading, isError, error } = useSessionsRange(
    range ? { dateRange: range } : {},
  );
  const allSessions = useMemo(() => data?.sessions ?? [], [data]);
  const connectorsQuery = useConnectors();
  const connectors = useMemo(
    () => connectorsQuery.data?.connectors ?? [],
    [connectorsQuery.data],
  );
  const providerOptions = useMemo(
    () => buildProviderOptions(connectors),
    [connectors],
  );

  const isMobile = useIsMobile();

  // --- Filter / sort / pagination state ------------------------------------
  const [search, setSearch] = useState('');
  // Empty set ⇒ "All providers". A specific selection is the set of
  // connectorIds the user has checked in the dropdown.
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sortCol, setSortCol] = useState<SortKey>('startedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allSelected = selectedConnectorIds.size === 0;

  const filtered = useMemo(() => {
    let rows = allSessions;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (s) =>
          (s.city ?? '').toLowerCase().includes(q) ||
          (s.address1 ?? '').toLowerCase().includes(q) ||
          (s.provider ?? '').toLowerCase().includes(q) ||
          (s.deviceName ?? '').toLowerCase().includes(q) ||
          (s.providerSessionId ?? '').toLowerCase().includes(q),
      );
    }
    if (!allSelected) {
      rows = rows.filter(
        (s) => s.connectorId != null && selectedConnectorIds.has(s.connectorId),
      );
    }
    const sorted = [...rows].sort((a, b) => {
      const cmp = compareValues(
        sortValueFor(a, sortCol),
        sortValueFor(b, sortCol),
      );
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [
    allSessions,
    search,
    allSelected,
    selectedConnectorIds,
    sortCol,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  const totals = useMemo(
    () => ({
      sessions: filtered.length,
      kwh: filtered.reduce((acc, r) => acc + r.powerKwh, 0).toFixed(1),
      cost: filtered.reduce((acc, r) => acc + r.price, 0).toFixed(2),
    }),
    [filtered],
  );

  function toggleSort(col: SortKey) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(0);
  }

  function SortIndicator({ col }: { col: SortKey }) {
    const active = sortCol === col;
    return (
      <Icon
        name="chevronDown"
        size={12}
        className={`transition-transform ${
          active
            ? `text-primary ${sortDir === 'asc' ? 'rotate-180' : ''}`
            : 'text-text-dim'
        }`}
      />
    );
  }

  // --- Date-range handlers (mirror SummaryPage) ----------------------------
  function handlePeriodClick(value: Period) {
    setPeriod(value);
    setCustomRange(undefined);
    setDraftRange(undefined);
    setRangePickerOpen(false);
    setPage(0);
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
    setPage(0);
  };

  function handleClearRange() {
    setCustomRange(undefined);
    setDraftRange(undefined);
    setRangePickerOpen(false);
    setPage(0);
  }

  // --- Provider dropdown handlers ------------------------------------------
  function handleSelectAll() {
    // Snap back to "All" (also visually clears every connector checkbox).
    setSelectedConnectorIds(new Set());
    setPage(0);
  }

  function handleToggleConnector(connectorId: string) {
    setSelectedConnectorIds((prev) => {
      const next = new Set(prev);
      if (next.has(connectorId)) {
        next.delete(connectorId);
      } else {
        next.add(connectorId);
      }
      return next;
    });
    setPage(0);
  }

  const providerTriggerLabel = allSelected ? 'All providers' : 'Selective';

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Date-range presets + custom range picker (left of search) */}
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
                  'h-9 rounded-md border px-3 text-xs font-medium transition-colors ' +
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
                  'flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ' +
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

        {/* Search input */}
        <div className="relative min-w-[200px] flex-1">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search sessions by location, provider, device…"
            className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-9 text-sm text-text outline-none placeholder:text-text-dim focus:border-primary"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-dim hover:text-text-muted"
              aria-label="Clear search"
            >
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </div>

        {/* Provider multi-select dropdown */}
        <DropdownMenu
          open={providerMenuOpen}
          onOpenChange={setProviderMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Filter by provider"
              className={
                'flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ' +
                (allSelected
                  ? 'border-border bg-card text-text-muted hover:bg-card-hover hover:text-text'
                  : 'border-primary bg-primary text-primary-foreground')
              }
            >
              <Icon name="connector" size={13} />
              <span>{providerTriggerLabel}</span>
              <Icon name="chevronDown" size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuCheckboxItem
              checked={allSelected}
              // Prevent Radix from closing the menu on click so users can
              // toggle multiple connectors without re-opening.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => handleSelectAll()}
            >
              All
            </DropdownMenuCheckboxItem>
            {providerOptions.length > 0 ? <DropdownMenuSeparator /> : null}
            {providerOptions.map((opt) => (
              <DropdownMenuCheckboxItem
                key={opt.connectorId}
                checked={selectedConnectorIds.has(opt.connectorId)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => handleToggleConnector(opt.connectorId)}
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Summary strip */}
      <div className="mb-4 flex flex-wrap items-center gap-5 rounded-lg border border-border bg-card px-4 py-2.5 text-xs text-text-muted">
        <span>
          <strong className="text-text">{totals.sessions}</strong> sessions
        </span>
        <span>
          <strong className="text-accent-green">{totals.kwh} kWh</strong> total
          energy
        </span>
        <span>
          <strong className="text-accent-amber">${totals.cost}</strong> total
          cost
        </span>
        {search ? (
          <span className="ml-auto text-text-dim">
            Filtered from {allSessions.length} sessions
          </span>
        ) : null}
      </div>

      {/* Mobile cards (phones) — replaces the table on narrow viewports */}
      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {isLoading ? (
            <Card className="p-6 text-center text-sm text-text-muted">
              <span className="inline-flex items-center gap-2">
                <span className="size-3 animate-spin rounded-full border-2 border-text-dim/40 border-t-primary" />
                Loading sessions…
              </span>
            </Card>
          ) : isError ? (
            <Card className="p-6 text-center text-sm text-error">
              {error instanceof Error
                ? error.message
                : 'Could not load sessions.'}
            </Card>
          ) : pageData.length === 0 ? (
            <Card className="p-6 text-center text-sm text-text-muted">
              No sessions match your search.
            </Card>
          ) : (
            pageData.map((s) => {
              const isExpanded = expandedId === s.id;
              return (
                <Card
                  key={s.id}
                  className="cursor-pointer gap-0 p-0 transition-colors hover:bg-card-hover"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  <div className="flex items-start justify-between gap-3 px-4 pt-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-text">
                        {formatDate(s.startedAt)}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {formatTimeOfDay(s.startedAt)} ·{' '}
                        {formatDuration(s.durationSeconds)}
                      </div>
                    </div>
                    <ProviderBadge provider={s.provider} />
                  </div>
                  <div className="flex items-center gap-1.5 px-4 pb-3 pt-2 text-xs">
                    <Icon
                      name="mapPin"
                      size={13}
                      className="shrink-0 text-text-dim"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-text">
                        {s.city ?? '—'}
                        {s.state ? `, ${s.state}` : ''}
                      </div>
                      {s.address1 ? (
                        <div className="truncate text-[11px] text-text-muted">
                          {s.address1}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-[13px]">
                    <span className="font-semibold text-accent-green">
                      {s.powerKwh.toFixed(2)} kWh
                    </span>
                    <span className="font-semibold text-accent-amber">
                      ${s.price.toFixed(2)}
                    </span>
                  </div>
                  {isExpanded ? (
                    <div className="border-t border-border/60 bg-card-hover px-4 py-3">
                      <DetailGrid session={s} />
                    </div>
                  ) : null}
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* Table (tablet + desktop) */
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="sticky top-0 z-10 cursor-pointer select-none border-b border-border bg-bg px-3.5 py-2.5 text-left text-xs font-medium text-text-muted"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.label}
                      <SortIndicator col={col.key} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-10 text-center text-sm text-text-muted"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="size-3 animate-spin rounded-full border-2 border-text-dim/40 border-t-primary" />
                      Loading sessions…
                    </span>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-10 text-center text-sm text-error"
                  >
                    {error instanceof Error
                      ? error.message
                      : 'Could not load sessions.'}
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-10 text-center text-sm text-text-muted"
                  >
                    No sessions match your search.
                  </td>
                </tr>
              ) : (
                pageData.map((s) => {
                  const isExpanded = expandedId === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? 'bg-card-hover' : 'hover:bg-card'
                        }`}
                      >
                        <td className="border-b border-border/40 px-3.5 py-2.5 align-middle text-[13px]">
                          <div className="font-medium text-text">
                            {formatDate(s.startedAt)}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {formatTimeOfDay(s.startedAt)}
                          </div>
                        </td>
                        <td className="border-b border-border/40 px-3.5 py-2.5 align-middle text-[13px]">
                          <ProviderBadge provider={s.provider} />
                        </td>
                        <td className="border-b border-border/40 px-3.5 py-2.5 align-middle text-[13px]">
                          <div className="flex items-center gap-1.5">
                            <Icon
                              name="mapPin"
                              size={13}
                              className="text-text-dim"
                            />
                            <div>
                              <div className="text-xs text-text">
                                {s.city ?? '—'}
                                {s.state ? `, ${s.state}` : ''}
                              </div>
                              <div className="text-[11px] text-text-muted">
                                {s.address1 ?? ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-border/40 px-3.5 py-2.5 align-middle text-[13px] text-text">
                          {formatDuration(s.durationSeconds)}
                        </td>
                        <td className="border-b border-border/40 px-3.5 py-2.5 align-middle text-[13px] font-semibold text-accent-green">
                          {s.powerKwh.toFixed(2)} kWh
                        </td>
                        <td className="border-b border-border/40 px-3.5 py-2.5 align-middle text-[13px] font-semibold text-accent-amber">
                          ${s.price.toFixed(2)}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="bg-card-hover">
                          <td
                            colSpan={COLUMNS.length}
                            className="border-b border-border/40 px-5 pb-4 pt-3"
                          >
                            <DetailGrid session={s} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
          <span>
            Page {safePage + 1} of {totalPages} — showing {pageData.length} of{' '}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
              const pageNum =
                totalPages <= 7
                  ? i
                  : safePage < 4
                    ? i
                    : Math.max(0, safePage - 3) + i;
              if (pageNum >= totalPages) return null;
              const active = safePage === pageNum;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  className={`size-8 rounded-md border text-xs transition-colors ${
                    active
                      ? 'border-primary bg-primary font-semibold text-primary-foreground'
                      : 'border-border bg-card text-text-muted hover:bg-card-hover hover:text-text'
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              aria-label="Next page"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
