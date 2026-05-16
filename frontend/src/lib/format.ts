import { getProviderMeta } from './providers';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()} ${MONTHS[d.getMonth()]} ${pad(d.getDate())}`;
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTimeOfDay(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
}

export type ProviderVariant = 'default' | 'chargepoint' | 'swtch' | 'flo';

export function providerVariant(
  name: string | null | undefined,
): ProviderVariant {
  // Delegates to the shared provider registry so the badge color stays in
  // sync with `PROVIDER_META`. Kept as a function (rather than removed) to
  // avoid churning every existing call site.
  return getProviderMeta(name).variant as ProviderVariant;
}

/** Format the top bar calendar date using the active app locale. */
export function formatTopBarDate(
  d: Date = new Date(),
  locale = 'en-CA',
): string {
  const weekday = locale.toLowerCase().startsWith('zh') ? 'long' : 'short';

  return new Intl.DateTimeFormat(locale, {
    weekday,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Format a timestamp as a locale-aware short relative string ("now",
 * "5 minutes ago", "yesterday", or a short date for older values).
 */
export function formatRelative(
  iso: string | Date | null | undefined,
  locale = 'en',
): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'short',
  });
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return rtf.format(0, 'second');
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const day = Math.floor(hr / 24);
  if (day < 7) return rtf.format(-day, 'day');
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(d);
}
