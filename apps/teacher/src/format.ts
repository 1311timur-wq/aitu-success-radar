import { ACADEMIC_TIME_ZONE, type Millis } from '@aitu/domain';

// All academic times are shown in the university zone, regardless of the browser's zone.
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, { timeZone: ACADEMIC_TIME_ZONE, ...opts }); cache.set(key, f); }
  return f;
}

export const formatDate = (ms: Millis, locale: string) => fmt(locale, { day: 'numeric', month: 'short', weekday: 'short' }).format(ms);
export const formatDateLong = (ms: Millis, locale: string) => fmt(locale, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(ms);
export const formatTime = (ms: Millis, locale: string) => fmt(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
export const formatDateTime = (ms: Millis, locale: string) => `${formatDate(ms, locale)}, ${formatTime(ms, locale)}`;

export const formatTimeRange = (start: Millis, minutes: number, locale: string) =>
  `${formatTime(start, locale)}–${formatTime(start + minutes * 60_000, locale)}`;

/** Percent for display only (domain keeps full precision). */
export const formatPercent = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}%`);

export const formatPoints = (v: number | null | undefined) =>
  v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
