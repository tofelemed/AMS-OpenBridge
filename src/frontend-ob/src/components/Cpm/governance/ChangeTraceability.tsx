/**
 * Which versions are producing today's verdicts.
 *
 * CHG-174 (owner review, badges 12-13, answer 1): the three version rows (Calculation engine, Dynamics profile, Threshold
 * profiles in use); a failed read says so with Retry (it showed "v— · —"). Registered loops went (the top bar shows the count);
 * the approval queue is its own tab; "Why versions are stored" is in How to read.
 *
 * CHG-202 (owner, 15 Nov 2026: no ids or backend text): "Calculations" with its version only (the engine's class and runtime
 * name went, as "engine" did elsewhere in CHG-200); threshold profiles in words; Build details went (the service build, the
 * engine builds, their commits and jar digests are not the reader's).
 */
import React from 'react';
import { useCpmCalculations, useCpmLoops } from '../../../hooks/useCpm';
import { EmptyState, KvRow } from '../shared';
import { codeLabel } from '../vocabulary';
import { ReadFailed } from './ReadFailed';

export const ChangeTraceability: React.FC = () => {
  const calc = useCpmCalculations();
  const loops = useCpmLoops();
  const profiles = [...new Set((loops.data?.loops ?? []).map(l => l.thresholdProfileId).filter((x): x is string => !!x))];
  const profileText = !loops.data ? '—' : profiles.length > 0 ? profiles.map(p => codeLabel(p)).join(', ') : 'defaults only';

  return (
    <section className="cpm-surface cpm-gov-trace" aria-label="Change traceability">
      <span className="cpm-eyebrow">Producing today&apos;s verdicts</span>
      {calc.isError && <ReadFailed title="Calculation versions could not be read" retry={() => void calc.refetch()} />}
      {calc.isLoading && <EmptyState title="Reading the calculation versions…" />}
      {calc.data && (
        <>
          <KvRow label="Calculations">v{calc.data.calculationVersion ?? '—'}</KvRow>
          <KvRow label="Dynamics profile">v{calc.data.dynamicsProfileVersion ?? '—'}</KvRow>
        </>
      )}
      {!calc.isError && <KvRow label="Threshold profiles in use">{profileText}</KvRow>}
    </section>
  );
};

export default ChangeTraceability;
