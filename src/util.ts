import type { Recurrence, StatusLabel, Task } from '../shared/types';
import { addDays, daysBetween, todayIn } from '../shared/dates';

export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const today = () => todayIn(localTz());

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseLocal(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(date: string, long = false): string {
  const t = today();
  const diff = daysBetween(t, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseLocal(date);
  if (diff > 1 && diff < 7 && !long) return d.toLocaleDateString([], { weekday: 'short' });
  const sameYear = date.slice(0, 4) === t.slice(0, 4);
  return d.toLocaleDateString([], {
    ...(long ? { weekday: 'short' } : {}),
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'done' | '';

export function dueTone(task: Task): DueTone {
  if (!task.due_date) return '';
  if (task.completed_at) return 'done';
  const diff = daysBetween(today(), task.due_date);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 2) return 'soon';
  return 'later';
}

export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return 'Does not repeat';
  const n = r.interval;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  let s = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  if (r.freq === 'daily' && n === 1) s = 'Daily';
  if (r.freq === 'weekly' && r.weekdays?.length) {
    const days = r.weekdays.join() === '1,2,3,4,5' ? 'weekdays' : r.weekdays.map((d) => WEEKDAYS[d]).join(', ');
    s = `${n === 1 ? 'Weekly' : `Every ${n} weeks`} on ${days}`;
  }
  if (r.freq === 'monthly' && n === 1) s = 'Monthly';
  if (r.freq === 'yearly' && n === 1) s = 'Yearly';
  return s;
}

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'At due time' },
  { value: 15, label: '15 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 180, label: '3 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
  { value: 10080, label: '1 week before' },
];

export function reminderLabel(m: number | null): string {
  return REMINDER_OPTIONS.find((o) => o.value === m)?.label ?? `${m} minutes before`;
}

export function statusOf(statuses: StatusLabel[], key: string): StatusLabel {
  return statuses.find((s) => s.key === key) ?? { key, label: key, color: '#c4c4c4' };
}

/** Buckets for the My Work view. */
export function bucketFor(task: Task): string {
  if (!task.due_date) return 'No date';
  const diff = daysBetween(today(), task.due_date);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const endOfWeek = addDays(today(), 6 - parseLocal(today()).getDay());
  if (task.due_date <= endOfWeek) return 'This week';
  return 'Later';
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
