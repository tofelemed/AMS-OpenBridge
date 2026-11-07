/** Which versions are producing today's verdicts, and the gate configuration waiting for approval. */
import React from 'react';
import { shortIdentity } from '../../../api/cpm/capabilities';
import { useCpmCalculations, useCpmCapabilities, useCpmLoops } from '../../../hooks/useCpm';
import { Toggletip } from '../../../ui/Toggletip';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { ConfigApprovalQueue } from '../config/ConfigApprovalQueue';
import { KvRow, PanelHead } from '../shared';

export const ChangeTraceability: React.FC = () => {
  const calc = useCpmCalculations();
  const caps = useCpmCapabilities();
  const loops = useCpmLoops();
  const profiles = new Set((loops.data?.loops ?? []).map(l => l.thresholdProfileId).filter((x): x is string => !!x));
  const builds = caps.data?.engine.observed ?? [];

  return (
    <section className="cpm-surface" aria-label="Change traceability">
      <PanelHead title="Change traceability"
        help={<Toggletip variant="how-to" label="Why versions are stored">
          <p>
            Every stored window carries these versions in its payload (A13), so any historical
            verdict can be attributed to the formula that produced it.
          </p>
        </Toggletip>} />
      <KvRow label="Calculation engine">v{calc.data?.calculationVersion ?? '—'} · {calc.data?.engine ?? '—'}</KvRow>
      <KvRow label="Dynamics profile">v{calc.data?.dynamicsProfileVersion ?? '—'}</KvRow>
      <KvRow label="cplm-api build">
        {caps.data ? `${caps.data.service.version} · ${shortIdentity(caps.data.service.sourceCommit)}` : '—'}
      </KvRow>
      <KvRow label="Registered loops">{loops.data?.count ?? '—'}</KvRow>
      <KvRow label="Threshold profiles in use">{profiles.size > 0 ? [...profiles].join(', ') : 'defaults only'}</KvRow>
      <TechnicalDetails items={caps.data
        ? (builds.length === 0
          ? [{ label: 'Engine builds observed', value: 'none stored yet', mono: false }]
          : builds.map((e, i) => ({
            label: `Engine build ${i + 1}`,
            value: `calc ${e.calculationVersion ?? '?'} · commit ${shortIdentity(e.sourceCommit)} · jar ${shortIdentity(e.jarSha256)}`,
          })))
        : []} />

      <PanelHead eyebrow="Approvals" title="Gate configuration awaiting approval" />
      <ConfigApprovalQueue />
    </section>
  );
};

export default ChangeTraceability;
