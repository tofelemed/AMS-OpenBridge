// PI-Vision-style time-expression parser (Phase 2 / checklist K10–K15).
//
// Standalone + pure so it can be unit-tested in isolation and reused by the TimeBar, per-symbol
// time overrides, and URL-param handling. Supports:
//   *            now                          t / today       today 00:00 (local)
//   *-8h         8 hours before now           y / yesterday   yesterday 00:00
//   *-30m        30 minutes before now        mon..sun        most recent weekday 00:00
//   t+9h         today 09:00                  jan..dec        1st of that month, this year, 00:00
//   -8h / 30m    offset alone → applied to an anchor (start→now, end→start)
//   2026-07-15T08:00  absolute timestamp (anything Date can parse)
// Units: s, m, h, d, w, mo, y. Fractional allowed for s/m/h/d/w; mo/y are truncated to whole steps.

export interface TimeParseResult {
  /** Resolved instant, or null when the input is invalid. */
  date: Date | null;
  /** Human-readable reason, present only when `date` is null. */
  error?: string;
}

const OFFSET_RE = /^([+-]?)(\d+(?:\.\d+)?)(mo|[smhdwy])$/i;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function applyOffset(base: Date, sign: number, num: number, unit: string): Date {
  const d = new Date(base);
  const s = sign * num;
  switch (unit) {
    case 's': d.setTime(d.getTime() + s * 1000); break;
    case 'm': d.setTime(d.getTime() + s * 60_000); break;
    case 'h': d.setTime(d.getTime() + s * 3_600_000); break;
    case 'd': d.setTime(d.getTime() + s * 86_400_000); break;
    case 'w': d.setTime(d.getTime() + s * 604_800_000); break;
    case 'mo': d.setMonth(d.getMonth() + Math.trunc(s)); break;
    case 'y': d.setFullYear(d.getFullYear() + Math.trunc(s)); break;
  }
  return d;
}

function resolveWeekday(idx: number, now: Date): Date {
  const d = startOfDay(now);
  let diff = d.getDay() - idx;
  if (diff < 0) diff += 7; // most recent occurrence, including today
  d.setDate(d.getDate() - diff);
  return d;
}

/** Resolve a base keyword to an instant, or null if it isn't a known keyword. */
function resolveKeyword(word: string, now: Date): Date | null {
  if (word === 'now') return new Date(now);
  if (word === 't' || word === 'today') return startOfDay(now);
  if (word === 'y' || word === 'yesterday') {
    const d = startOfDay(now);
    d.setDate(d.getDate() - 1);
    return d;
  }
  let wi = WEEKDAYS.indexOf(word);
  if (wi < 0) wi = WEEKDAYS_FULL.indexOf(word);
  if (wi >= 0) return resolveWeekday(wi, now);
  let mi = MONTHS.indexOf(word);
  if (mi < 0) mi = MONTHS_FULL.indexOf(word);
  if (mi >= 0) return new Date(now.getFullYear(), mi, 1, 0, 0, 0, 0);
  return null;
}

/**
 * Parse a time expression. `opts.now` fixes "now" (for tests / determinism); `opts.anchor` is the
 * reference an offset-alone input resolves against (a start field anchors to now; an end field to
 * the resolved start).
 */
export function parseTimeExpression(input: string, opts: { now?: Date; anchor?: Date } = {}): TimeParseResult {
  const now = opts.now ?? new Date();
  const raw = (input ?? '').trim();
  if (!raw) return { date: null, error: 'Enter a time or expression' };
  const lower = raw.toLowerCase();

  // 1) offset alone → relative to the anchor (default now)
  const off = lower.match(OFFSET_RE);
  if (off) {
    const anchor = opts.anchor ?? now;
    const sign = off[1] === '-' ? -1 : 1;
    return { date: applyOffset(anchor, sign, parseFloat(off[2]), off[3].toLowerCase()) };
  }

  // 2) base keyword, optionally followed by a single offset
  let base: Date | null = null;
  let rest = '';
  let baseLabel = '';
  if (lower[0] === '*') {
    base = new Date(now);
    rest = lower.slice(1);
    baseLabel = '*';
  } else {
    const w = lower.match(/^[a-z]+/);
    if (w) {
      base = resolveKeyword(w[0], now);
      rest = lower.slice(w[0].length);
      baseLabel = w[0];
    }
  }
  if (base) {
    if (!rest) return { date: base };
    const rm = rest.match(OFFSET_RE);
    if (rm) {
      const sign = rm[1] === '-' ? -1 : 1;
      return { date: applyOffset(base, sign, parseFloat(rm[2]), rm[3].toLowerCase()) };
    }
    return { date: null, error: `Invalid offset "${rest}" after "${baseLabel}"` };
  }

  // 3) absolute timestamp
  const t = new Date(raw);
  if (!Number.isNaN(t.getTime())) return { date: t };

  return { date: null, error: `Unrecognized time "${raw}"` };
}

/** True when the expression is relative (tracks "now"), i.e. not a fixed absolute timestamp. */
export function isRelativeExpression(input: string): boolean {
  const s = (input ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith('*')) return true;
  if (OFFSET_RE.test(s)) return true;
  const w = s.match(/^[a-z]+/)?.[0];
  return !!w && resolveKeyword(w, new Date()) !== null;
}

/** True when the expression resolves to (approximately) "now" — used to decide live mode. */
export function isNowExpression(input: string): boolean {
  const s = (input ?? '').trim().toLowerCase();
  return s === '*' || s === 'now';
}
