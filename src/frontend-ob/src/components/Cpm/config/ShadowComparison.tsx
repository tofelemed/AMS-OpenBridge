/**
 * v2.5 Task 3D.1 (spec §5.5): the shadow run of a draft - started on demand over a retained
 * interval of one loop, no operational output - and its before / after gate matrix as the server
 * materialises it (SHADOW rows against the LIVE rows of the same windows). When symptoms disappear
 * the server marks POLICY_RECLASSIFICATION, and the approver sees it here before deciding.
 * CHG-169 (owner review): the bundle's Shadow tab. Run shadow is the one control (the lifecycle column's Shadow button only
 * switched to this tab); "Shadow evaluation ○ Not run ?" heads it. A frozen version no longer reads "Validate the bundle first"
 * (it is validated; why it cannot run is said once, under the tabs). Times read "6 Nov 10:45", the zone named once.
 * CHG-184 (owner review item 0): the run row names the loop only, never the run id.
 * CHG-220 (Gate Configuration check, gap 7): the comparison is read again until the run ends (it stopped at "Submitted", which
 * is not "Running"), it is kept per run (Run again shows the new run, not the last one), and a run of content the draft no
 * longer has is not shown as its comparison.
 * Task 8 (journey): the step reads "Try on past data": no explanatory text, "Starting… (about 30 s)" while the start request runs (a 502 / 504
 * is the gateway giving up on a run the server still links: read again, no error), "Waiting for free capacity" after 2 min queued,
 * "No matching live results to compare"; the loop and hours are asked only for a type or plant change.
 * Final review: M-e - the period is asked in days (1-7, the server runs whole days; sent as hours); M-d - the window table names
 * diagnoses and gate results in words (the CPA vocabulary), never engine codes; M-a - "change", not "draft".
 */
import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KvRow, QueryError, TonePill } from '../shared';
import { codeLabel, diagnosisLabel, humanise } from '../vocabulary';
import { gateName } from '../gateStatus';
import { stamp, zoneTag } from '../events/eventTime';
import { stampZoned } from './configWords';
import { ApiError, apiJson } from '../../../api/apiFetch';
import { CPM_BASE } from '../../../api/cpm/base';
import type { Bundle } from '../../../api/cpm/config';
import { ReasonedButton } from '../ReasonedButton';

export interface ShadowReport {
  bundleId: string; analysisRunId: string | null; runState: string; loopId: string | null; fromMs: number | null; toMs: number | null;
  shadowRows: number; comparedWindows: number; symptomsRemoved: number; symptomsAdded: number; reclassification: string | null; comparedAt: string;
  windows: Array<{ windowKind: string; windowEnd: string; diagnosisBefore: string | null; diagnosisAfter: string | null; changed: Array<{ gate: string; before: string | null; after: string | null }> }>;
}

/** The states in which a run is over; any other (submitted, running) is read again. */
export const RUN_ENDED = new Set(['FINISHED', 'FAILED', 'CANCELED', 'SUBMIT_FAILED', 'NOT_RUN', 'UNKNOWN']);

export const useShadowReport = (bundleId: string | undefined, runId: string | undefined, enabled: boolean) => useQuery({
  queryKey: ['cpm', 'config', 'shadow', bundleId ?? '', runId ?? ''],
  queryFn: ({ signal }) => apiJson<ShadowReport>(`${CPM_BASE}/configuration/drafts/${encodeURIComponent(bundleId!)}/shadow`, { signal }),
  enabled: !!bundleId && enabled,
  refetchInterval: q => (RUN_ENDED.has(q.state.data?.runState ?? 'RUNNING') ? false : 10_000),
});

const runPill = (run: string) => (run === 'FINISHED' ? { tone: 'good' as const, glyph: '✓' }
  : RUN_ENDED.has(run) ? { tone: (run === 'FAILED' || run === 'SUBMIT_FAILED' ? 'bad' : 'muted') as 'bad' | 'muted', glyph: run === 'FAILED' || run === 'SUBMIT_FAILED' ? '✕' : '○' }
  : { tone: 'warn' as const, glyph: '◐' });

/** The start request timed out at the gateway (502 / 504): the server links the run anyway, so it is not an error. */
export const isGatewayTimeout = (e: unknown): boolean => e instanceof ApiError && (e.status === 502 || e.status === 504);
const QUEUED_AFTER_MS = 2 * 60_000;
const STARTING = 'Starting… (about 30 s)';
/** A run submitted or running for over 2 minutes is waiting for a free worker. */
export const waitingForCapacity = (runState: string | undefined, startedAt: string | undefined, now = Date.now()): boolean =>
  (runState === 'SUBMITTED' || runState === 'RUNNING') && !!startedAt && now - Date.parse(startedAt) > QUEUED_AFTER_MS;

/** The days typed as the hours the server reads: a whole number of days, 1 to 7 (blank or not a number: 1). */
export const daysToHours = (text: string): number => {
  const d = Math.round(Number(text));
  return (Number.isFinite(d) && d >= 1 ? Math.min(7, d) : 1) * 24;
};

/** "Operating region: Warning → Pass": a gate's result change in words. */
const gateChange = (c: { gate: string; before: string | null; after: string | null }) =>
  `${gateName(c.gate)}: ${c.before ? codeLabel(c.before) : '—'} → ${c.after ? codeLabel(c.after) : '—'}`;

export const ShadowComparison: React.FC<{
  bundle: Bundle;
  defaultLoopId: string | undefined;
  canShadow: boolean;
  pending: boolean;
  error: unknown;
  onStart: (args: { loopId?: string; hours?: number }) => void;
}> = ({ bundle, defaultLoopId, canShadow, pending, error, onStart }) => {
  const recorded = bundle.shadow as { analysisRunId?: string; loopId?: string; state?: string; contentHash?: string; startedAt?: string } | null;
  // a run of other content (the draft was edited since) is not this content's comparison
  const stale = !!recorded?.analysisRunId && !!recorded.contentHash && recorded.contentHash !== bundle.contentHash;
  const shadow = stale ? null : recorded;
  const [loopId, setLoopId] = useState(defaultLoopId ?? '');
  const [days, setDays] = useState('1');
  const qc = useQueryClient();
  const timedOut = isGatewayTimeout(error);
  // a timeout reads "Starting" only until the bundle shows a run it did not have before, or 2 minutes pass
  const runAtTimeout = useRef<{ id: string | null } | null>(null);
  if (timedOut && !runAtTimeout.current) runAtTimeout.current = { id: shadow?.analysisRunId ?? null };
  if (!timedOut) runAtTimeout.current = null;
  const linked = timedOut && (shadow?.analysisRunId ?? null) !== runAtTimeout.current?.id;
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!timedOut) { setExpired(false); return undefined; }
    const t = setTimeout(() => setExpired(true), QUEUED_AFTER_MS);
    return () => clearTimeout(t);
  }, [timedOut]);
  // the server links the run even when the gateway gave up: read the bundle and the comparison again
  useEffect(() => { if (timedOut) void qc.invalidateQueries({ queryKey: ['cpm', 'config'] }); }, [timedOut, qc]);
  const report = useShadowReport(bundle.bundleId, shadow?.analysisRunId, !!shadow?.analysisRunId);
  const validated = bundle.state === 'VALIDATED' || bundle.state === 'SHADOW_EVALUATED';
  const startable = validated && canShadow;
  // a draft (or a rejected one) has to be checked first; a frozen version's reason is said once, under the bundle's tabs
  const unvalidated = bundle.state === 'DRAFT' || bundle.state === 'REJECTED';
  const run = report.data?.runState;
  const isLoop = bundle.scopeKind === 'LOOP';
  const starting = pending || (timedOut && !linked && !expired);
  const queued = waitingForCapacity(run, shadow?.startedAt);
  return (
    <section className="cpm-config-tabpanel" data-testid="shadow-comparison">
      <div className="cpm-panel-head">
        <div className="cpm-title-row">
          <h2 className="cpm-panel-title">Try on past data</h2>
          {run && shadow?.analysisRunId
            ? <TonePill tone={runPill(run).tone} glyph={runPill(run).glyph}>{queued ? 'Waiting for free capacity' : humanise(run)}</TonePill>
            : !shadow?.analysisRunId && <TonePill tone="muted" glyph="○">Not tried</TonePill>}
        </div>
      </div>
      {shadow?.analysisRunId && <KvRow label="Run on">{shadow.loopId}</KvRow>}
      {stale && <p className="cpm-copy">This change was edited after the last run.</p>}
      {report.isError && <QueryError error={report.error} retry={() => void report.refetch()} />}
      {report.data && shadow?.analysisRunId && (
        <>
          <KvRow label="Period">{report.data.fromMs != null ? `${stamp(report.data.fromMs)} → ${stampZoned(report.data.toMs)}` : '—'}</KvRow>
          <KvRow label="Compared">{report.data.comparedWindows} of {report.data.shadowRows} windows</KvRow>
          <KvRow label="Symptoms">{report.data.symptomsRemoved} removed · {report.data.symptomsAdded} added</KvRow>
          {report.data.reclassification && <p className="cpm-field__error" role="alert" data-testid="reclassification">Reported symptoms disappear under this change; say so in the approval note.</p>}
          {report.data.windows.length > 0 && (
            <table className="cpm-table" data-table="shadow-diff">
              <thead><tr><th>Window · {zoneTag()}</th><th>Diagnosis before → after</th><th>Gates changed</th></tr></thead>
              <tbody>
                {report.data.windows.slice(0, 40).map(w => (
                  <tr key={`${w.windowKind}-${w.windowEnd}`}>
                    <td>{w.windowKind} · {stamp(w.windowEnd)}</td>
                    <td>{w.diagnosisBefore ? diagnosisLabel(w.diagnosisBefore) : '—'} → {w.diagnosisAfter ? diagnosisLabel(w.diagnosisAfter) : '—'}</td>
                    <td>{w.changed.map(gateChange).join('; ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.data.runState === 'FINISHED' && report.data.comparedWindows === 0 && <p className="cpm-copy">{report.data.shadowRows === 0 ? 'No data in the chosen period' : 'No matching live results to compare'}</p>}
          {report.data.runState === 'FINISHED' && report.data.comparedWindows > 0 && report.data.windows.length === 0 && (
            <p className="cpm-copy">Same result in {report.data.comparedWindows === 1 ? 'the compared window' : `all ${report.data.comparedWindows} compared windows`}</p>
          )}
          {(report.data.runState === 'FAILED' || report.data.runState === 'SUBMIT_FAILED') && <p className="cpm-field__error">The run failed</p>}
          {report.data.runState === 'CANCELED' && <p className="cpm-copy">The run was cancelled</p>}
        </>
      )}
      <div className="cpm-config-inline">
        {!isLoop && (
          <>
            <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Loop</span>
              <input className="cpm-input" value={loopId} onChange={e => setLoopId(e.target.value)} /></label>
            <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Days</span>
              <input className="cpm-input" type="number" min={1} max={7} step={1} value={days} onChange={e => setDays(e.target.value)} inputMode="numeric" /></label>
          </>
        )}
        <ReasonedButton variant="raised" disabled={!startable || starting}
          reason={!canShadow ? 'Needs permission to try changes' : unvalidated ? 'Check the change first' : null}
          onClick={() => onStart({ loopId: isLoop ? undefined : loopId || undefined, hours: isLoop ? 24 : daysToHours(days) })}>
          {starting ? STARTING : recorded?.analysisRunId ? 'Try again' : 'Try on past data'}
        </ReasonedButton>
      </div>
      {error && (!timedOut || (expired && !linked)) ? <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null}
    </section>
  );
};
