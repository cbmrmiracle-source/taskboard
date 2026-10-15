import type { Recurrence } from './types';

// Calendar dates are handled as YYYY-MM-DD strings and computed in UTC so
// that daylight-saving changes never shift a day.

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isDateString(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime());
}

export function isTimeString(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

export function weekday(date: string): number {
  return parse(date).getUTCDay();
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Same day-of-month N months later, clamped to the end of shorter months. */
export function addMonths(date: string, n: number, day?: number): string {
  const d = parse(date);
  const want = day ?? d.getUTCDate();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m = total % 12;
  return format(new Date(Date.UTC(y, m, Math.min(want, daysInMonth(y, m)))));
}

/** The first occurrence of the rule strictly after `from`. */
export function nextOccurrence(rule: Recurrence, from: string): string {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  switch (rule.freq) {
    case 'daily':
      return addDays(from, interval);
    case 'weekly': {
      const days = (rule.weekdays ?? []).filter((n) => n >= 0 && n <= 6);
      if (days.length === 0) return addDays(from, 7 * interval);
      const weekStart = addDays(from, -weekday(from));
      for (let i = 1; i <= 7 * interval + 7; i++) {
        const cand = addDays(from, i);
        const weeks = daysBetween(weekStart, addDays(cand, -weekday(cand))) / 7;
        if (days.includes(weekday(cand)) && weeks % interval === 0) return cand;
      }
      return addDays(from, 7 * interval);
    }
    case 'monthly':
      return addMonths(from, interval);
    case 'yearly':
      return addMonths(from, 12 * interval);
  }
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Converts a wall-clock date and time in `tz` to a UTC timestamp. */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMs(guess, tz);
  let res = guess - off;
  const off2 = tzOffsetMs(res, tz);
  if (off2 !== off) res = guess - off2;
  return res;
}

/** Today's date in the given time zone. */
export function todayIn(tz: string, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now),
  );
}

export const DEFAULT_REMINDER_TIME = '09:00';
