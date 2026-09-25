'use client';

/**
 * Explorer › Summary › Calculations: the loop's newest result at any served
 * window kind — the long (fused) kinds show the gate outcome counts and the
 * long-diagnostics metrics of that row; the short kinds show the per-window
 * features and G0–G4/G2r verdicts (the Window Inspector's own panel).
 *
 * Loaded lazily on "Show calculations" (cpa-ui-fix-plan Phase 3): the kinds
 * come from the served window contract, the default kind is the fused row the
 * workspace already holds (no request), and every other kind is fetched only
 * when it is picked.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import type { CpmLoop } from '../../../../api/cpmApi';
import { ApiError } from '../../../../api/apiFetch';
import { useCpmKpis, useCpmResolutions, useLatestGates } from '../../../../hooks/useCpm';
import { EmptyState, KvRow, QueryError, TonePill, fmtDateTime, toneFor, windowSpecsOf } from '../../shared';
import { glyphFor } from '../../gateStatus';
import { calculationsHref, windowsHref } from '../../cpaHref';
import { LONG_METRICS, WindowResultsPanel, fmtVal } from '../../windows/WindowResults';

const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

/** The fused row at one long kind: outcome counts, verdict, and the long metrics it carried. */
const FusedResult: React.FC<{ loop: CpmLoop; kind: string }> = ({ loop, kind }) => {
  const gates = useLatestGates(loop.loopId, kind);
  const m = gates.data;
  if (gates.isLoading) return <EmptyState title="Loading…" />;
  if (gates.isError && !isNoVerdictYet(gates.error)) {
    return <QueryError title="Result unavailable" error={gates.error} retry={() => void gates.refetch()} />;
  }
  if (!m) return <EmptyState title={`No fused ${kind} result yet`} copy="Outcomes appear once a window of this size has been evaluated." />;
  const counts = { good: 0, warn: 0, bad: 0, muted: 0 };
  for (const g of m.gates) counts[glyphFor(g.status).tone] += 1;
  const half = Math.ceil(LONG_METRICS.length / 2);
  return (
    <>
      <p className="cpm-copy cpm-source-line">
        <TonePill tone={toneFor(m.diagnosis)}>{(m.diagnosis ?? 'NONE').replace(/_/g, ' ')}</TonePill>
        {m.confidence != null ? ` ${(m.confidence * 100).toFixed(0)}% confidence · ` : ' '}
        window ending {m.windowEnd ? fmtDateTime(m.windowEnd) : '—'} · {counts.good} pass · {counts.warn} attention · {counts.bad} failed · {counts.muted} not evaluated
      </p>
      <div className="cpm-grid-2">
        <div>
          {LONG_METRICS.slice(0, half).map(x => (
            <KvRow key={x.field} label={x.label}><span className="cpm-mono">{fmtVal(m.metrics?.[x.field], x.pct)}</span></KvRow>
          ))}
        </div>
        <div>
          {LONG_METRICS.slice(half).map(x => (
            <KvRow key={x.field} label={x.label}><span className="cpm-mono">{fmtVal(m.metrics?.[x.field], x.pct)}</span></KvRow>
          ))}
        </div>
      </div>
    </>
  );
};

/** The newest short window at one kind: the Inspector's own results panel. */
const ShortResult: React.FC<{ loop: CpmLoop; kind: string }> = ({ loop, kind }) => {
  const kpis = useCpmKpis(loop.loopId, kind, 1);
  const row = kpis.data?.samples?.[0];
  if (kpis.isLoading) return <EmptyState title="Loading…" />;
  if (kpis.isError) return <QueryError title="Window results unavailable" error={kpis.error} retry={() => void kpis.refetch()} />;
  if (!row) return <EmptyState title={`No ${kind} windows stored yet`} copy="Rows appear as the short-feature engine emits results at this granularity." />;
  return (
    <>
      <p className="cpm-copy">Newest {kind} window ending {row.window_end ? fmtDateTime(row.window_end as string) : '—'}</p>
      <WindowResultsPanel row={row} tier="short" bare />
    </>
  );
};

export const SummaryCalculations: React.FC<{ loop: CpmLoop; defaultKind: string }> = ({ loop, defaultKind }) => {
  const navigate = useNavigate();
  const resolutions = useCpmResolutions();
  const fused = resolutions.data?.fusion.firesOn ?? [defaultKind];
  const shortKinds = windowSpecsOf(resolutions.data, () => 0).filter(w => w.tier === 'short').map(w => w.kind);
  const [picked, setPicked] = useState<string | null>(null);
  const kind = picked ?? (fused.includes(defaultKind) ? defaultKind : fused[fused.length - 1] ?? defaultKind);
  const isFused = fused.includes(kind);
  const known = [...fused, ...shortKinds];

  return (
    <div>
      <div className="cpm-filter-row" style={{ marginBottom: 8 }}>
        <ObcToggleButtonGroup value={kind} aria-label="Window kind"
          onValue={(e: CustomEvent<{ value: string }>) => { if (known.includes(e.detail.value)) setPicked(e.detail.value); }}>
          {fused.map(k => <ObcToggleButtonOption key={k} value={k}>{k} · long</ObcToggleButtonOption>)}
          {shortKinds.map(k => <ObcToggleButtonOption key={k} value={k}>{k} · short</ObcToggleButtonOption>)}
        </ObcToggleButtonGroup>
        {resolutions.isError && <span className="cpm-event-row__sub">window contract unavailable — showing the fused kinds only</span>}
      </div>
      {isFused ? <FusedResult loop={loop} kind={kind} /> : <ShortResult loop={loop} kind={kind} />}
      <div className="cpm-inspector__actions">
        <ObcButton variant="normal" title={`Every ${kind} window of ${loop.loopId}`}
          onClick={() => navigate(windowsHref(loop.loopId, { profile: kind }))}>
          Window history ›
        </ObcButton>
        <ObcButton variant="flat" title="What the engine computes, with its versions"
          onClick={() => navigate(calculationsHref(loop.loopId))}>
          Full catalogue ›
        </ObcButton>
      </div>
    </div>
  );
};

export default SummaryCalculations;
