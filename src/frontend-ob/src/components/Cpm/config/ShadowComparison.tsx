/**
 * v2.5 Task 3D.1 (spec §5.5): the shadow run of a draft - started on demand over a retained
 * interval of one loop, no operational output - and its before / after gate matrix as the server
 * materialises it (SHADOW rows against the LIVE rows of the same windows). When symptoms disappear
 * the server marks POLICY_RECLASSIFICATION, and the approver sees it here before deciding.
 * CHG-169 (owner review): the bundle's Shadow tab. Run shadow is the one control (the lifecycle column's Shadow button only
 * switched to this tab); "Shadow evaluation ○ Not run ?" heads it. A frozen version no longer reads "Validate the bundle first"
 * (it is validated; why it cannot run is said once, under the tabs). Times read "6 Nov 10:45", the zone named once.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KvRow, QueryError, TonePill } from '../shared';
import { humanise } from '../vocabulary';
import { stamp, zoneTag } from '../events/eventTime';
import { stampZoned } from './configWords';
import { apiJson } from '../../../api/apiFetch';
import { CPM_BASE } from '../../../api/cpm/base';
import type { Bundle } from '../../../api/cpm/config';
import { ReasonedButton } from '../ReasonedButton';
import { Toggletip } from '../../../ui/Toggletip';

export interface ShadowReport {
  bundleId: string; analysisRunId: string | null; runState: string; loopId: string | null; fromMs: number | null; toMs: number | null;
  shadowRows: number; comparedWindows: number; symptomsRemoved: number; symptomsAdded: number; reclassification: string | null; comparedAt: string;
  windows: Array<{ windowKind: string; windowEnd: string; diagnosisBefore: string | null; diagnosisAfter: string | null; changed: Array<{ gate: string; before: string | null; after: string | null }> }>;
}

export const useShadowReport = (bundleId: string | undefined, enabled: boolean) => useQuery({
  queryKey: ['cpm', 'config', 'shadow', bundleId ?? ''],
  queryFn: ({ signal }) => apiJson<ShadowReport>(`${CPM_BASE}/configuration/drafts/${encodeURIComponent(bundleId!)}/shadow`, { signal }),
  enabled: !!bundleId && enabled,
  refetchInterval: q => ((q.state.data?.runState ?? 'RUNNING') === 'RUNNING' ? 10_000 : false),
});

export const ShadowComparison: React.FC<{
  bundle: Bundle;
  defaultLoopId: string | undefined;
  canShadow: boolean;
  pending: boolean;
  error: unknown;
  onStart: (args: { loopId?: string; hours?: number }) => void;
}> = ({ bundle, defaultLoopId, canShadow, pending, error, onStart }) => {
  const shadow = bundle.shadow as { analysisRunId?: string; loopId?: string; state?: string } | null;
  const [loopId, setLoopId] = useState(defaultLoopId ?? '');
  const [hours, setHours] = useState('24');
  const report = useShadowReport(bundle.bundleId, !!shadow?.analysisRunId);
  const validated = bundle.state === 'VALIDATED' || bundle.state === 'SHADOW_EVALUATED';
  const startable = validated && canShadow;
  // a draft (or a rejected one) has to be validated first; a frozen version's reason is said once, under the bundle's tabs
  const unvalidated = bundle.state === 'DRAFT' || bundle.state === 'REJECTED';
  const run = report.data?.runState;
  return (
    <section className="cpm-config-tabpanel" data-testid="shadow-comparison">
      <div className="cpm-panel-head">
        <div className="cpm-title-row">
          <h2 className="cpm-panel-title">Shadow evaluation</h2>
          {run
            ? <TonePill tone={run === 'FINISHED' ? 'good' : run === 'RUNNING' ? 'warn' : 'muted'} glyph={run === 'FINISHED' ? '✓' : run === 'RUNNING' ? '◐' : '○'}>{humanise(run)}</TonePill>
            : !shadow?.analysisRunId && <TonePill tone="muted" glyph="○">Not run</TonePill>}
          <Toggletip variant="how-to" label="What a shadow run does">
            <p>A shadow run re-evaluates a retained interval of one loop under this draft, isolated by purpose - no episode, no operational result. The comparison is against the LIVE results of the same windows.</p>
          </Toggletip>
        </div>
      </div>
      {shadow?.analysisRunId && <KvRow label="Run">{shadow.analysisRunId.slice(0, 8)} on {shadow.loopId}</KvRow>}
      <div className="cpm-config-inline">
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Loop</span>
          <input className="cpm-input" value={loopId} onChange={e => setLoopId(e.target.value)} placeholder="loop id" disabled={bundle.scopeKind === 'LOOP'} /></label>
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Hours</span>
          <input className="cpm-input" value={hours} onChange={e => setHours(e.target.value)} inputMode="numeric" /></label>
        <ReasonedButton variant="raised" disabled={!startable || pending}
          reason={!canShadow ? 'Needs the cpm.config.shadow permission' : unvalidated ? 'Validate the bundle first — only a validated bundle can be shadow-run' : null}
          onClick={() => onStart({ loopId: bundle.scopeKind === 'LOOP' ? undefined : loopId || undefined, hours: Number(hours) || 24 })}>
          {pending ? 'Starting…' : shadow?.analysisRunId ? 'Run again' : 'Run shadow'}
        </ReasonedButton>
      </div>
      {error ? <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null}
      {report.isError && <QueryError error={report.error} retry={() => void report.refetch()} />}
      {report.data && (
        <>
          <KvRow label="Support">{report.data.fromMs != null ? `${stamp(report.data.fromMs)} → ${stampZoned(report.data.toMs)}` : '—'}</KvRow>
          <KvRow label="Windows">{report.data.shadowRows} shadow row(s), {report.data.comparedWindows} compared with a LIVE result</KvRow>
          <KvRow label="Symptoms">{report.data.symptomsRemoved} removed · {report.data.symptomsAdded} added</KvRow>
          {report.data.reclassification && <p className="cpm-field__error" role="alert" data-testid="reclassification">{report.data.reclassification}: this draft makes previously reported symptoms disappear. Approval must state that it changes what the site calls a finding.</p>}
          {report.data.windows.length > 0 && (
            <table className="cpm-table" data-table="shadow-diff">
              <thead><tr><th>Window · {zoneTag()}</th><th>Diagnosis before → after</th><th>Gates changed</th></tr></thead>
              <tbody>
                {report.data.windows.slice(0, 40).map(w => (
                  <tr key={`${w.windowKind}-${w.windowEnd}`}>
                    <td>{w.windowKind} · {stamp(w.windowEnd)}</td>
                    <td>{w.diagnosisBefore ?? '—'} → {w.diagnosisAfter ?? '—'}</td>
                    <td className="cpm-mono">{w.changed.map(c => `${c.gate}: ${c.before ?? '—'}→${c.after ?? '—'}`).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.data.runState === 'FINISHED' && report.data.comparedWindows === 0 && <p className="cpm-copy">The run finished but no window had a LIVE counterpart to compare with (the loop had no live results over the interval).</p>}
        </>
      )}
    </section>
  );
};
