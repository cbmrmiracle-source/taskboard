import { describe, expect, it } from 'vitest';
import { addMonths, nextOccurrence, todayIn, zonedToUtc } from '../shared/dates';

describe('nextOccurrence', () => {
  it('daily and every N days', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, '2026-10-14')).toBe('2026-10-15');
    expect(nextOccurrence({ freq: 'daily', interval: 3 }, '2026-12-30')).toBe('2027-01-02');
  });

  it('weekly on chosen weekdays', () => {
    // 2026-10-14 is a Wednesday
    const rule = { freq: 'weekly' as const, interval: 1, weekdays: [1, 3, 5] };
    expect(nextOccurrence(rule, '2026-10-14')).toBe('2026-10-16');
    expect(nextOccurrence(rule, '2026-10-16')).toBe('2026-10-19');
  });

  it('every other week', () => {
    const rule = { freq: 'weekly' as const, interval: 2, weekdays: [1, 5] };
    expect(nextOccurrence(rule, '2026-10-12')).toBe('2026-10-16'); // same week Friday
    expect(nextOccurrence(rule, '2026-10-16')).toBe('2026-10-26'); // skips a week
    expect(nextOccurrence({ freq: 'weekly', interval: 2 }, '2026-10-14')).toBe('2026-10-28');
  });

  it('monthly clamps to short months, yearly handles leap day', () => {
    expect(nextOccurrence({ freq: 'monthly', interval: 1 }, '2026-01-31')).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(nextOccurrence({ freq: 'monthly', interval: 3 }, '2026-11-15')).toBe('2027-02-15');
    expect(nextOccurrence({ freq: 'yearly', interval: 1 }, '2028-02-29')).toBe('2029-02-28');
  });
});

describe('time zones', () => {
  it('converts wall-clock time across DST', () => {
    expect(new Date(zonedToUtc('2026-07-01', '09:00', 'America/New_York')).toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(new Date(zonedToUtc('2026-12-01', '09:00', 'America/New_York')).toISOString()).toBe('2026-12-01T14:00:00.000Z');
    expect(new Date(zonedToUtc('2026-10-14', '20:30', 'Asia/Jerusalem')).toISOString()).toBe('2026-10-14T17:30:00.000Z');
  });

  it('today in a zone', () => {
    const t = Date.UTC(2026, 9, 15, 2, 0);
    expect(todayIn('America/Los_Angeles', t)).toBe('2026-10-14');
    expect(todayIn('Asia/Tokyo', t)).toBe('2026-10-15');
  });
});
