'use client';

/**
 * CPLM Phase 7 (F0.3) — shared CPM primitives.
 * Styling comes from OpenBridge tokens via classes in styles/cpm.css; the CPA
 * prototype's tone vocabulary (good|warn|bad|muted) maps onto OpenBridge
 * status/alert token colors there, never onto raw hex here.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop, CpmWindowSpec } from '../../api/cpmApi';

export type CpmTone = 'good' | 'warn' | 'bad' | 'muted';

/**
 * Resolve a CSS color (incl. var() chains) to a concrete rgb() for echarts, which
 * renders to canvas and can't consume var(). A hidden span in the live DOM resolves
 * against the CURRENT theme cascade — more reliable than
 * getComputedStyle(documentElement).getPropertyValue, which returns empty whenever
 * the theme tokens are scoped to a selector documentElement doesn't match (the cause
 * of the CPM loop trends rendering with washed-out / missing colors).
 */
export function resolveCssColor(value: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const el = document.createElement('span');
  el.style.color = value;
  el.style.display = 'none';
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color;
  el.remove();
  return resolved || fallback;
}

/**
 * Shared CPM trend palette — the SAME pen colors the Trend page (TrendCore) uses, so
 * loop trends on Historical / Investigation / Replay / Overview read consistently
 * (PI-Vision style) and stay visible in every theme. PV=green, OP=amber, SP/axis=
 * neutral, overlay/cursor=violet. Call inside the chart useMemo (keyed on obcTheme)
 * so it re-resolves on a theme switch.
 */
export function cpmChartColors() {
  return {
    good:   resolveCssColor('var(--ams-pen-2)', '#40c057'),          // PV line + envelope band
    amber:  resolveCssColor('var(--ams-pen-3)', '#fab005'),          // OP line
    grey:   resolveCssColor('var(--element-neutral-color)', '#9aa6af'), // axis, grid, SP
    accent: resolveCssColor('var(--ams-pen-5)', '#7048e8'),          // overlay / evidence cursor
    pink:   resolveCssColor('var(--ams-pen-4)', '#e64980'),          // VP (valve position) pen
  };
}

/**
 * P2-13 - every CPM timestamp render used bare toLocaleString() with no zone
 * label, while the CSV exports write raw UTC ISO. An operator at UTC+5 saw
 * 16:49 on screen and 11:49:00Z in the export and read the 5-hour gap as a
 * data error. One formatter, always naming the zone.
 */
export const fmtDateTime = (ts: string | number | null | undefined): string =>
  ts != null && ts !== '' ? new Date(ts).toLocaleString(undefined, { timeZoneName: 'short' }) : '\u2014';

/**
 * A window ending "now", quantized to `tickMs`, that ADVANCES.
 *
 * Both the Overview loop-focus panel and the Explorer summary anchored their 8h
 * trend window once per selected loop, so a screen left open on a wallboard kept
 * rendering the window that ended when the loop was clicked — hours stale, with
 * nothing saying so. Quantizing matters because start/end go into the react-query
 * key: an unquantized Date.now() would mint a new cache entry every render.
 *
 * Callers must pass the resulting window to a POLL-AWARE fetch (useCpmTrend's
 * `pollDriven`), because these refetches are machine-initiated and must not extend
 * the idle-session clock.
 */
export function useRollingWindow(spanMs: number, tickMs: number) {
  const [endMs, setEndMs] = React.useState(() => Math.floor(Date.now() / tickMs) * tickMs);
  React.useEffect(() => {
    const id = setInterval(
      () => setEndMs(Math.floor(Date.now() / tickMs) * tickMs), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return React.useMemo(
    () => ({ start: new Date(endMs - spanMs), end: new Date(endMs) }),
    [endMs, spanMs],
  );
}

/** Shared trend-window defaults for the 8h loop panels. */
export const TREND_SPAN_MS = 8 * 3600_000;
export const TREND_TICK_MS = 60_000;

/**
 * Window-contract formatting, in one place so the Overview ladder, the Window
 * Inspector and the onboarding wizard describe a window identically. They used to
 * each phrase it themselves and two of them were wrong (claiming every short
 * window was tumbling, and that short-tier lateness was watermark-bounded).
 */
/**
 * Duration in the unit a control engineer would use, and — importantly —
 * CONSISTENTLY within a column.
 *
 * The first version picked the largest unit that divided exactly, which rendered
 * the six short-tier lateness values as "30 s · 1 min · 90 s · 2 min · 2 min ·
 * 3 min" (units flip-flopping mid-column) and labelled the 60m window "1h" while
 * its own row header said 60m. Rule now: seconds below a minute, minutes up to and
 * including an hour (one decimal when needed), hours above that.
 */
export const fmtDuration = (ms: number | null | undefined): string => {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms <= 3_600_000) {
    const min = ms / 60_000;
    return `${Number.isInteger(min) ? min : min.toFixed(1)} min`;
  }
  const h = ms / 3_600_000;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
};

/**
 * "1 min tumbling" · "5 min / 1 min slide" · "24h slice · 15 min cadence".
 *
 * Returns '' for UNKNOWN_ASSIGNER — i.e. when the API is older than this UI and
 * served window names without their shape. Saying nothing is the point: inventing
 * a shape is exactly the defect this contract replaced.
 */
export const UNKNOWN_ASSIGNER = 'unknown';

export function fmtWindowShape(
  w: CpmWindowSpec,
  opts: { omitCadence?: boolean } = {},
): string {
  if (w.assigner === UNKNOWN_ASSIGNER) return '';
  if (w.assigner === 'sliding' && w.slideMs != null) {
    return `${fmtDuration(w.sizeMs)} / ${fmtDuration(w.slideMs)} slide`;
  }
  if (w.assigner === 'rolling-buffer') {
    // omitCadence: the caller has already stated the cadence once for the whole
    // tier, so repeating it per row is the duplication grouping was meant to end.
    const cadence = w.cadenceMs && !opts.omitCadence ? ` · ${fmtDuration(w.cadenceMs)} cadence` : '';
    return `${fmtDuration(w.sizeMs)} slice${cadence}`;
  }
  return `${fmtDuration(w.sizeMs)} ${w.assigner}`;
}

/**
 * The served window contract, or a names-only fallback built from the legacy
 * shortWindows/longWindows arrays when the API predates `windows`. Version skew is
 * realistic (the gateway can route to an older cplm-api during a rolling deploy),
 * and a window SELECTOR that renders zero options is worse than one that renders
 * names without shapes.
 */
export function windowSpecsOf(
  data: { windows?: CpmWindowSpec[]; shortWindows?: string[]; longWindows?: string[] } | undefined,
  sizeMsOf: (kind: string) => number,
): CpmWindowSpec[] {
  if (data?.windows?.length) return data.windows;
  const mk = (kind: string, tier: 'short' | 'long'): CpmWindowSpec => ({
    kind, tier, assigner: UNKNOWN_ASSIGNER, sizeMs: sizeMsOf(kind),
    slideMs: null, allowedLatenessMs: null, cadenceMs: null, minSamples: null,
    feeds: '', overlapping: false,
  });
  return [
    ...(data?.shortWindows ?? []).map(w => mk(w, 'short')),
    ...(data?.longWindows ?? []).map(w => mk(w, 'long')),
  ];
}

/** Lateness/overlap qualifier, or null when the window has nothing to add. */
export function fmtWindowLateness(w: CpmWindowSpec): string | null {
  if (w.allowedLatenessMs != null) return `${fmtDuration(w.allowedLatenessMs)} allowed lateness`;
  if (w.minSamples != null) return `needs ≥ ${w.minSamples} samples`;
  return null;
}

/**
 * Controller-mode classification — a faithful mirror of the engine's
 * CplmNormalizedSample.isAutoMode() (P1-7), including its ordering: explicit
 * manual tokens are checked BEFORE the compound-string fallback so IMAN/ROUT
 * are never mistaken for auto.
 *
 * This exists because the UI re-introduced the exact bug that P1-7 fixed in the
 * engine: the mode track tested `mode === 'AUTO'`, and the strings real systems
 * emit are "AUT", "CAS"/"CASCADE", "MAN" — so the good branch was unreachable
 * and a loop in perfect automatic rendered amber across its whole history.
 * If you change the engine's sets, change these too.
 */
const AUTO_MODE_TOKENS = new Set([
  'AUTO', 'AUT', 'A', 'AUTOMATIC', 'NORMAL', 'NORM',
  'CAS', 'CASC', 'CASCADE', 'RSP', 'DDC', 'SUP', 'SUPERVISORY',
]);
const MANUAL_MODE_TOKENS = new Set([
  'MAN', 'MANUAL', 'M', 'IMAN', 'ROUT', 'LO', 'LOCAL', 'OFF', 'TRACK',
]);

export type ModeClass = 'auto' | 'manual' | 'unknown';

export function classifyMode(mode: string | null | undefined): ModeClass {
  if (mode == null) return 'unknown';
  const m = mode.trim().toUpperCase();
  if (m === '' || m === 'UNKNOWN') return 'unknown';
  if (MANUAL_MODE_TOKENS.has(m)) return 'manual';
  if (AUTO_MODE_TOKENS.has(m)) return 'auto';
  if (m.includes('AUTO') || m.includes('CASCADE')) return 'auto';
  // A manual-family compound ("IMAN-TRACK") should not fall through to unknown
  // looking neutral; the engine treats everything non-auto as not-auto, and the
  // track's job is to show when the loop was NOT under closed-loop control.
  if (m.includes('MAN')) return 'manual';
  return 'unknown';
}

/**
 * Deep link to the Trend page for a loop's mapped signals. Meaningful since the
 * signal-asset projection: loop tag paths now resolve through the UNS to the
 * loop pipeline's real transports (root.<site>.cpm.<loop>.<role> + the loop's
 * live Sparkplug device), so a /trend pen on them draws actual data.
 *
 * Numeric roles only — MODE is a TEXT series and a line chart on it is noise;
 * it has its own ribbon on Historical.
 */
export function loopTrendHref(
  tags: Record<string, string>, range = '8h',
  /** Optional explicit window — lands on /trend PINNED to it (?from=&to=),
   * so an episode or Historical range carries over instead of resetting to live. */
  window?: { from: Date; to: Date },
): string | null {
  const paths = ['PV', 'SP', 'OP', 'VP']
    .map(r => tags[r])
    .filter((p): p is string => !!p);
  if (paths.length === 0) return null;
  const q = new URLSearchParams({ tags: [...new Set(paths)].join(','), range });
  if (window) {
    q.set('from', window.from.toISOString());
    q.set('to', window.to.toISOString());
  }
  return `/trend?${q.toString()}`;
}

/** Diagnosis / band / state → tone, in one place so every screen agrees. */
export function toneFor(value: string | null | undefined): CpmTone {
  if (!value) return 'muted';
  const v = value.toUpperCase();
  // STRONG is the engine's strongest evidence level, not an unknown value.
  // Without this branch the gates that PRODUCE a high-severity diagnosis
  // (G7 stiction shape, G8 Horch oddness, G9 phase geometry) fell through to
  // 'muted' and rendered identically to "not evaluated" - weaker WARN gates
  // looked more alarming than the ones driving the verdict.
  if (v.startsWith('CONFIRMED') || v.startsWith('SUSPECTED') || v === 'FAIL' || v === 'BAD'
      || v === 'STRONG' || v === 'CRITICAL' || v === 'HIGH')
    return 'bad';
  if (v.startsWith('DETECTED') || v.startsWith('CLASSIFIED') || v === 'WARN' || v === 'REVIEW'
      || v === 'SHELVED' || v.startsWith('EXCLUDED') || v === 'MEDIUM')
    return 'warn';
  if (v === 'PASS' || v === 'GOOD' || v === 'ACKNOWLEDGED' || v === 'ACTIVE' || v === 'RUNNING'
      || v === 'HEALTHY' || v === 'ACCEPTABLE' || v === 'LOW')
    return 'good';
  // PENDING / NOT_EVALUATED / INSUFFICIENT_EVIDENCE stay muted deliberately:
  // "we did not judge this" must not look like a verdict either way.
  return 'muted';
}

/** CPA's dot+label pill. */
export const TonePill: React.FC<{ tone?: CpmTone; children: React.ReactNode }> = ({
  tone = 'muted',
  children,
}) => (
  <span className={`cpm-pill cpm-pill--${tone}`}>
    <span className="cpm-pill__dot" aria-hidden />
    {children}
  </span>
);

/** CPA's KPI tile: caption / value / sub, toned. */
export const KpiTile: React.FC<{
  caption: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: CpmTone;
}> = ({ caption, value, sub, tone = 'muted' }) => (
  <div className={`cpm-kpi cpm-kpi--${tone}`}>
    <span className="cpm-kpi__caption">{caption}</span>
    <span className="cpm-kpi__value">{value}</span>
    {sub != null && <span className="cpm-kpi__sub">{sub}</span>}
  </div>
);

/** CPA's workspace header: eyebrow / title / copy / actions. */
export const WorkspaceHeader: React.FC<{
  eyebrow: string;
  title: string;
  copy?: string;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, copy, actions }) => (
  <header className="cpm-workspace-header">
    <div>
      <span className="cpm-eyebrow">{eyebrow}</span>
      <h1 className="cpm-title">{title}</h1>
      {copy && <p className="cpm-copy">{copy}</p>}
    </div>
    {actions && <div className="cpm-workspace-header__actions">{actions}</div>}
  </header>
);

/** Panel head: eyebrow + h2 + optional right slot (CPA's .surface-head). */
export const PanelHead: React.FC<{
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}> = ({ eyebrow, title, right }) => (
  <div className="cpm-panel-head">
    <div>
      <span className="cpm-eyebrow">{eyebrow}</span>
      <h2 className="cpm-panel-title">{title}</h2>
    </div>
    {right && <div className="cpm-panel-head__right">{right}</div>}
  </div>
);

/** Loop dropdown fed by the registry; used by every toolbar (U5–U9 pattern). */
export const LoopSelect: React.FC<{
  loops: CpmLoop[];
  value: string;
  onChange: (loopId: string) => void;
  label?: string;
}> = ({ loops, value, onChange, label = 'Control loop' }) => (
  <label className="cpm-field">
    <span className="cpm-field__label">{label}</span>
    <select
      className="cpm-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {loops.map((l) => (
        <option key={l.loopId} value={l.loopId}>
          {l.loopId} · {l.displayName}
        </option>
      ))}
    </select>
  </label>
);

/** Key/value row (CPA's .kv). */
export const KvRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="cpm-kv">
    <span className="cpm-kv__label">{label}</span>
    <span className="cpm-kv__value">{children}</span>
  </div>
);

/** Honest empty state — the alternative to fabricated numbers. */
export const EmptyState: React.FC<{
  title: string;
  copy?: string;
  action?: { label: string; onClick: () => void };
}> = ({ title, copy, action }) => (
  <div className="cpm-empty">
    <h3>{title}</h3>
    {copy && <p>{copy}</p>}
    {action && (
      <ObcButton variant="normal" onClick={action.onClick}>
        {action.label}
      </ObcButton>
    )}
  </div>
);

/**
 * Distinct error state so a fetch failure is never mistaken for "no data".
 * `error` is the react-query error (an ApiError carries a friendly `.message`);
 * `retry` wires the query's refetch. Rendered with the same EmptyState chrome.
 */
export const QueryError: React.FC<{
  title?: string;
  error: unknown;
  retry?: () => void;
}> = ({ title = 'Could not load this data', error, retry }) => (
  <EmptyState
    title={title}
    copy={error instanceof Error ? error.message : 'The service is currently unavailable.'}
    action={retry ? { label: 'Retry', onClick: retry } : undefined}
  />
);

