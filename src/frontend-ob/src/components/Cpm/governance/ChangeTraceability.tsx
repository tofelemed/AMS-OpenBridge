/**
 * Which versions are producing today's verdicts.
 *
 * CHG-174 (owner review, badges 12-13, answer 1): the three version rows (Calculation engine, Dynamics profile, Threshold
 * profiles in use); the builds (cplm-api build, the engine builds observed) in a Build details dialog, the commit cut to 12
 * characters with its "-dirty" mark (it was shown whole); a failed read says so with Retry (it showed "v— · —"). Registered loops
 * went (the top bar shows the count); the approval queue is its own tab; "Why versions are stored" is in How to read.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { shortIdentity } from '../../../api/cpm/capabilities';
import { useCpmCalculations, useCpmCapabilities, useCpmLoops } from '../../../hooks/useCpm';
import { EmptyState, KvRow, QueryError } from '../shared';
import { RecordDialog, type RecordPart } from './RecordDialog';

const BuildDetails: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const caps = useCpmCapabilities();
  const builds = caps.data?.engine.observed ?? [];
  const parts: RecordPart[] = caps.data ? [
    { title: 'Service', rows: [{
      label: 'cplm-api build', shown: `${caps.data.service.version} · ${shortIdentity(caps.data.service.sourceCommit)}`,
      copy: `${caps.data.service.version} · ${caps.data.service.sourceCommit}`,
    }] },
    { title: 'Engine builds observed', rows: builds.length === 0
      ? [{ label: 'Engine builds', shown: 'none stored yet', mono: false }]
      : builds.map((e, i) => ({
        label: `Engine build ${i + 1}`,
        shown: `calc ${e.calculationVersion ?? '?'} · commit ${shortIdentity(e.sourceCommit)} · jar ${shortIdentity(e.jarSha256)}`,
        copy: `calc ${e.calculationVersion ?? '?'} · commit ${e.sourceCommit ?? 'unknown'} · jar ${e.jarSha256 ?? 'unknown'}`,
      })) },
  ] : [];
  return (
    <RecordDialog title="Build details" parts={parts} open={open} onClose={onClose}>
      {caps.isLoading && <p className="cpm-copy">Reading the builds…</p>}
      {caps.isError && <QueryError title="Build details could not be read" error={caps.error} retry={() => void caps.refetch()} />}
    </RecordDialog>
  );
};

export const ChangeTraceability: React.FC = () => {
  const calc = useCpmCalculations();
  const loops = useCpmLoops();
  const [builds, setBuilds] = useState(false);
  const profiles = [...new Set((loops.data?.loops ?? []).map(l => l.thresholdProfileId).filter((x): x is string => !!x))];
  const profileText = !loops.data ? '—' : profiles.length > 0 ? profiles.join(', ') : 'defaults only';

  return (
    <section className="cpm-surface cpm-gov-trace" aria-label="Change traceability">
      <span className="cpm-eyebrow">Producing today&apos;s verdicts</span>
      {calc.isError && <QueryError title="Calculation versions could not be read" error={calc.error} retry={() => void calc.refetch()} />}
      {calc.isLoading && <EmptyState title="Reading the calculation versions…" />}
      {calc.data && (
        <>
          <KvRow label="Calculation engine">v{calc.data.calculationVersion ?? '—'} · {calc.data.engine}</KvRow>
          <KvRow label="Dynamics profile">v{calc.data.dynamicsProfileVersion ?? '—'}</KvRow>
        </>
      )}
      {!calc.isError && <KvRow label="Threshold profiles in use">{profileText}</KvRow>}
      <div className="cpm-gov-trace__foot">
        <ObcButton variant="flat" onClick={() => setBuilds(true)}>Build details</ObcButton>
      </div>
      <BuildDetails open={builds} onClose={() => setBuilds(false)} />
    </section>
  );
};

export default ChangeTraceability;
