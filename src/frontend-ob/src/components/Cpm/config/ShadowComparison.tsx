/**
 * v2.5 Task 3D.1 (spec §5.5): the shadow run of a draft - started on demand over a retained
 * interval of one loop, no operational output - and its before / after gate matrix as the server
 * materialises it (SHADOW rows against the LIVE rows of the same windows). When symptoms disappear
 * the server marks POLICY_RECLASSIFICATION, and the approver sees it here before deciding.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KvRow, PanelHead, QueryError, TonePill, fmtDateTime } from '../shared';
import { apiJson } from '../../../api/apiFetch';
import { CPM_BASE } from '../../../api/cpm/base';
import type { Bundle } from '../../../api/cpm/config';
import { ReasonedButton } from '../ReasonedButton';

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
  const startable = (bundle.state === 'VALIDATED' || bundle.state === 'SHADOW_EVALUATED') && canShadow;
  return (
    <section className="cpm-config-tabpanel" data-testid="shadow-comparison">
      <PanelHead eyebrow="Shadow evaluation" title={shadow?.analysisRunId ? `run ${shadow.analysisRunId.slice(0, 8)} on ${shadow.loopId}` : 'not run'}
        right={report.data ? <TonePill tone={report.data.runState === 'FINISHED' ? 'good' : report.data.runState === 'RUNNING' ? 'warn' : 'muted'}>{report.data.runState}</TonePill> : undefined} />
      <p className="cpm-copy">A shadow run re-evaluates a retained interval of one loop under this draft, isolated by purpose - no episode, no operational result. The comparison is against the LIVE results of the same windows.</p>
      <div className="cpm-config-inline">
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Loop</span>
          <input className="cpm-input" value={loopId} onChange={e => setLoopId(e.target.value)} placeholder="loop id" disabled={bundle.scopeKind === 'LOOP'} /></label>
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Hours</span>
          <input className="cpm-input" value={hours} onChange={e => setHours(e.target.value)} inputMode="numeric" /></label>
        <ReasonedButton variant="raised" disabled={!startable || pending}
          reason={!canShadow ? 'Needs the cpm.config.shadow permission' : !startable ? 'Validate the bundle first — only a validated bundle can be shadow-run' : null}
          onClick={() => onStart({ loopId: bundle.scopeKind === 'LOOP' ? undefined : loopId || undefined, hours: Number(hours) || 24 })}>
          {pending ? 'Starting…' : shadow?.analysisRunId ? 'Run again' : 'Run shadow'}
        </ReasonedButton>
      </div>
      {!canShadow && <p className="cpm-copy">Starting a shadow run needs cpm.config.shadow.</p>}
      {bundle.state !== 'VALIDATED' && bundle.state !== 'SHADOW_EVALUATED' && <p className="cpm-copy">Validate the draft first (state {bundle.state}).</p>}
      {error ? <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null}
      {report.isError && <QueryError error={report.error} retry={() => void report.refetch()} />}
      {report.data && (
        <>
          <KvRow label="support">{report.data.fromMs != null ? `${fmtDateTime(report.data.fromMs)} → ${fmtDateTime(report.data.toMs)}` : '—'}</KvRow>
          <KvRow label="windows">{report.data.shadowRows} shadow row(s), {report.data.comparedWindows} compared with a LIVE result</KvRow>
          <KvRow label="symptoms">{report.data.symptomsRemoved} removed · {report.data.symptomsAdded} added</KvRow>
          {report.data.reclassification && <p className="cpm-field__error" role="alert" data-testid="reclassification">{report.data.reclassification}: this draft makes previously reported symptoms disappear. Approval must state that it changes what the site calls a finding.</p>}
          {report.data.windows.length > 0 && (
            <table className="cpm-table" data-table="shadow-diff">
              <thead><tr><th>window</th><th>diagnosis before → after</th><th>gates changed</th></tr></thead>
              <tbody>
                {report.data.windows.slice(0, 40).map(w => (
                  <tr key={`${w.windowKind}-${w.windowEnd}`}>
                    <td>{w.windowKind} · {fmtDateTime(w.windowEnd)}</td>
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
