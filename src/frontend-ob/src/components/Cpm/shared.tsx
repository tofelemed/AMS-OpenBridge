'use client';

/**
 * CPLM Phase 7 (F0.3) — shared CPM primitives.
 * Styling comes from OpenBridge tokens via classes in styles/cpm.css; the CPA
 * prototype's tone vocabulary (good|warn|bad|muted) maps onto OpenBridge
 * status/alert token colors there, never onto raw hex here.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../api/cpmApi';

export type CpmTone = 'good' | 'warn' | 'bad' | 'muted';

/**
 * P2-13 - every CPM timestamp render used bare toLocaleString() with no zone
 * label, while the CSV exports write raw UTC ISO. An operator at UTC+5 saw
 * 16:49 on screen and 11:49:00Z in the export and read the 5-hour gap as a
 * data error. One formatter, always naming the zone.
 */
export const fmtDateTime = (ts: string | number | null | undefined): string =>
  ts != null && ts !== '' ? new Date(ts).toLocaleString(undefined, { timeZoneName: 'short' }) : '\u2014';

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
