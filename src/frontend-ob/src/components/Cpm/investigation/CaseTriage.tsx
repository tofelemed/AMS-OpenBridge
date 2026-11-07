/**
 * The Investigation page's controls in the loop band (CHG-129): analysis case, live or historical, profile and evaluated window,
 * each one dropdown. Cases come from the fleet's served verdicts (`cases.ts`). A case narrows the loop control's list.
 */
import React from 'react';
import type { useSearchParams } from 'react-router-dom';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { EmptyState } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import type { useCpmScope } from '../plantScope';
import { CASE_LABEL } from './cases';
import { windowLabel } from '../windowLabel';
import type { WindowOption } from '../evidence/useEvidenceWindows';
import { sameInstant } from '../evidence/useWindowAt';

type SetParams = ReturnType<typeof useSearchParams>[1];

export const CaseControls: React.FC<{
  cases: [string, number][];
  caseFilter: string | null;
  mode: string;
  windowKind: string;
  windows: WindowOption[];
  matrix: CpmGateMatrix | undefined;
  setParams: SetParams;
}> = ({ cases, caseFilter, mode, windowKind, windows, matrix, setParams }) => (
  <>
    <select className="cpm-select" aria-label="Analysis case" value={caseFilter ?? ''}
      onChange={e => setParams(p => {
        if (e.target.value) { p.set('case', e.target.value); p.delete('loop'); } else p.delete('case');
        return p;
      }, { replace: true })}>
      <option value="">All cases</option>
      {cases.map(([c, n]) => <option key={c} value={c}>{`${CASE_LABEL[c] ?? c} · ${n}`}</option>)}
    </select>
    <select className="cpm-select" aria-label="Source" value={mode}
      onChange={e => setParams(p => { p.set('mode', e.target.value); if (e.target.value === 'live') p.delete('window'); return p; }, { replace: true })}>
      <option value="live">Live</option>
      <option value="historical">Historical</option>
    </select>
    <select className="cpm-select" aria-label="Profile" value={windowKind}
      onChange={e => setParams(p => { p.set('profile', e.target.value); p.delete('window'); return p; }, { replace: true })}>
      <option value="12h">12h fused</option>
      <option value="24h">24h fused</option>
    </select>
    {mode === 'historical' && (
      <select className="cpm-select" aria-label="Evaluated window"
        value={windows.find(w => sameInstant(w.windowEnd, matrix?.windowEnd))?.windowEnd ?? matrix?.windowEnd ?? ''}
        onChange={e => setParams(p => { p.set('window', e.target.value); return p; }, { replace: true })}>
        {matrix?.windowEnd && !windows.some(w => sameInstant(w.windowEnd, matrix.windowEnd)) && (
          <option value={matrix.windowEnd}>{windowLabel({ windowKind, windowEnd: matrix.windowEnd })} · {diagnosisLabel(matrix.diagnosis)}</option>
        )}
        {windows.map(w => (
          <option key={w.windowEnd} value={w.windowEnd}>
            {windowLabel({ windowKind, windowEnd: w.windowEnd })} · {diagnosisLabel(w.diagnosis ?? null)}
          </option>
        ))}
      </select>
    )}
    {/* One announcement of the resolved selection across the controls above. */}
    <span className="cpm-sr-only" aria-live="polite">
      Source: {mode === 'live' ? 'live, the latest verdict' : 'historical'}.
      Profile {windowKind} fused.
      {caseFilter ? ` Case filter: ${CASE_LABEL[caseFilter] ?? caseFilter}.` : ' No case filter.'}
    </span>
  </>
);

/** No verdict to triage in this scope: says why, and offers the way out. */
export const NoEvaluatedLoops: React.FC<{ scope: ReturnType<typeof useCpmScope> }> = ({ scope }) => (
  <section className="cpm-surface">
    <EmptyState level={2} title="No evaluated loops yet"
      copy={scope.active
        ? 'No loop in the selected plant scope has a fused verdict yet — the scope may be too narrow, or its loops have not completed a 12 h / 24 h window.'
        : 'No loop has completed a 12 h / 24 h evaluation window yet. Pipeline Health shows whether the analysis jobs are running.'}
      action={scope.active ? { label: 'Clear the plant scope', onClick: () => scope.set({ site: '' }) } : undefined}
      next={scope.active ? undefined : [{ label: 'Pipeline Health', to: '/cpm/pipeline' }]} />
  </section>
);
