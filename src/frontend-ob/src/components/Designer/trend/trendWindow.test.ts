/** CHG-175: the Trend page's period: its ranges, the half-period step that never passes now, and the band's dates. */
import { describe, expect, it } from 'vitest';
import { TREND_RANGES, endsAtNow, fixedPeriodOf, periodText, rangeForSpan, rangeOf, stepPeriod } from './trendWindow';

const H = 3_600_000;
const T = (iso: string) => Date.parse(iso);

describe('Trend ranges', () => {
  it('offers 15m, 1h, 8h, 24h and 7d, in the words of Historical', () => {
    expect(TREND_RANGES.map(r => r.key)).toEqual(['15m', '1h', '8h', '24h', '7d']);
  });

  it('opens an old 1d or 1w link on the same span', () => {
    expect(rangeOf('1d')).toEqual({ key: '24h', ms: 24 * H });
    expect(rangeOf('1w')).toEqual({ key: '7d', ms: 7 * 24 * H });
  });

  it('reads 15m when the address names no range or an unknown one', () => {
    expect(rangeOf(null).key).toBe('15m');
    expect(rangeOf('3y').key).toBe('15m');
  });

  it('names a fixed period by its span, or by none', () => {
    expect(rangeForSpan(24 * H)?.key).toBe('24h');
    expect(rangeForSpan(7 * 24 * H + 30_000)?.key).toBe('7d');
    expect(rangeForSpan(12 * H)).toBeNull();
  });
});

describe('a fixed period in the address', () => {
  const q = (s: string) => new URLSearchParams(s);
  it('reads from and to', () => {
    expect(fixedPeriodOf(q('from=2026-11-06T10:45:00.000Z&to=2026-11-06T22:45:00.000Z')))
      .toEqual({ start: T('2026-11-06T10:45:00Z'), end: T('2026-11-06T22:45:00Z') });
  });
  it('is none when a date is missing, unreadable or backwards', () => {
    expect(fixedPeriodOf(q('from=2026-11-06T10:45:00Z'))).toBeNull();
    expect(fixedPeriodOf(q('from=x&to=y'))).toBeNull();
    expect(fixedPeriodOf(q('from=2026-11-06T22:45:00Z&to=2026-11-06T10:45:00Z'))).toBeNull();
  });
});

describe('stepping', () => {
  const now = T('2026-11-11T17:48:00Z');
  const day = { start: T('2026-11-06T10:45:00Z'), end: T('2026-11-06T22:45:00Z') };

  it('moves half a period earlier', () => {
    expect(stepPeriod(day, -1, now)).toEqual({ start: T('2026-11-06T04:45:00Z'), end: T('2026-11-06T16:45:00Z') });
  });

  it('moves half a period later', () => {
    expect(stepPeriod(day, 1, now)).toEqual({ start: T('2026-11-06T16:45:00Z'), end: T('2026-11-07T04:45:00Z') });
  });

  it('never steps into the future: the period stops at now and keeps its span', () => {
    const week = { start: now - 7 * 24 * H - H, end: now - H };
    expect(stepPeriod(week, 1, now)).toEqual({ start: now - 7 * 24 * H, end: now });
  });

  it('knows a period that already ends now', () => {
    expect(endsAtNow(now, now)).toBe(true);
    expect(endsAtNow(now - 30_000, now)).toBe(true);
    expect(endsAtNow(now - 2 * 60_000, now)).toBe(false);
  });
});

describe('the dates in the band', () => {
  it('says a day once when the period starts and ends on it', () => {
    expect(periodText(T('2026-11-06T10:45:00Z'), T('2026-11-06T22:45:00Z'), 'UTC')).toBe('6 Nov 10:45 → 22:45');
  });

  it('names both days when they differ', () => {
    expect(periodText(T('2026-11-04T17:48:00Z'), T('2026-11-11T17:48:00Z'), 'UTC')).toBe('4 Nov 17:48 → 11 Nov 17:48');
  });

  it('reads in the zone it is given, never the browser zone', () => {
    expect(periodText(T('2026-11-06T10:45:00Z'), T('2026-11-06T22:45:00Z'), 'Asia/Dubai')).toBe('6 Nov 14:45 → 7 Nov 02:45');
  });
});
