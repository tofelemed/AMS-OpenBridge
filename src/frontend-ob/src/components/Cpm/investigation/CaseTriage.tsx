/**
 * The Investigation page's analysis case, in the loop band (CHG-141; CHG-160 took it out of More). Cases come from the fleet's
 * served verdicts (`cases.ts`). A case narrows the loop control's list. Its options name it ("All cases"), as the other band
 * controls are named by theirs, so it has no visible label.
 */
import { pipelineStep, usePipelineAccess } from '../access';
import React from 'react';
import type { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../shared';
import type { useCpmScope } from '../plantScope';
import { CASE_LABEL } from './cases';

type SetParams = ReturnType<typeof useSearchParams>[1];

export const CaseSelect: React.FC<{
  cases: [string, number][];
  caseFilter: string | null;
  setParams: SetParams;
}> = ({ cases, caseFilter, setParams }) => (
  <select className="cpm-select" aria-label="Analysis case" value={caseFilter ?? ''}
      onChange={e => setParams(p => {
        if (e.target.value) { p.set('case', e.target.value); p.delete('loop'); } else p.delete('case');
        return p;
      }, { replace: true })}>
    <option value="">All cases</option>
    {cases.map(([c, n]) => <option key={c} value={c}>{`${CASE_LABEL[c] ?? c} · ${n}`}</option>)}
  </select>
);

/** One announcement of the resolved selection, outside More so it is heard while More is closed. */
export const CaseAnnouncement: React.FC<{ caseFilter: string | null; windowKind: string }> = ({ caseFilter, windowKind }) => (
  <span className="cpm-sr-only" aria-live="polite">
    Profile {windowKind} fused.
    {caseFilter ? ` Case filter: ${CASE_LABEL[caseFilter] ?? caseFilter}.` : ' No case filter.'}
  </span>
);

/** No verdict to triage in this scope: says why, and offers the way out. */
export const NoEvaluatedLoops: React.FC<{ scope: ReturnType<typeof useCpmScope> }> = ({ scope }) => {
  const canPipeline = usePipelineAccess();
  return (
  <section className="cpm-surface">
    <EmptyState level={2} title="No evaluated loops yet"
      copy={scope.active
        ? 'No loop in the selected plant scope has a fused verdict yet — the scope may be too narrow, or its loops have not completed a 12 h / 24 h window.'
        : 'No loop has completed a 12 h / 24 h evaluation window yet. Pipeline Health shows whether the analysis jobs are running.'}
      action={scope.active ? { label: 'Clear the plant scope', onClick: () => scope.set({ site: '' }) } : undefined}
      next={scope.active ? undefined : pipelineStep(canPipeline, '/cpm/pipeline')} />
  </section>
  );
};
