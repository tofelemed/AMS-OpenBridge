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

/** Diagnosis / band / state → tone, in one place so every screen agrees. */
export function toneFor(value: string | null | undefined): CpmTone {
  if (!value) return 'muted';
  const v = value.toUpperCase();
  if (v.startsWith('CONFIRMED') || v.startsWith('SUSPECTED') || v === 'FAIL' || v === 'BAD')
    return 'bad';
  if (v.startsWith('DETECTED') || v.startsWith('CLASSIFIED') || v === 'WARN' || v === 'REVIEW'
      || v === 'SHELVED' || v.startsWith('EXCLUDED'))
    return 'warn';
  if (v === 'PASS' || v === 'GOOD' || v === 'ACKNOWLEDGED' || v === 'ACTIVE' || v === 'RUNNING'
      || v === 'HEALTHY' || v === 'ACCEPTABLE')
    return 'good';
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
