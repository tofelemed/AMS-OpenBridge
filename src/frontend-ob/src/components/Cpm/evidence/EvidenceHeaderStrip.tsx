/**
 * v2.5 workbench (audit F13): what the reader is looking at, as ONE row of labelled facts that never
 * overlap - the window in the site zone with its samples, the selection mode, the evidence readiness,
 * the computed age and the run id - and the window navigation (newer / older / newest). Identity
 * hashes live in the explain panel; here only what places the run in time.
 */
import React from 'react';
import type { MethodRun } from '../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../api/cpm/catalogue';
import { TonePill, WorkspaceHeader, fmtDuration } from '../shared';
import type { EvidenceSelection } from './selection';
import { CopyableId } from './CopyableId';

export interface EvidenceHeaderStripProps {
  selection: EvidenceSelection;
  run: MethodRun | undefined;
  entry: GateCatalogueEntry | undefined;
  loopName: string | undefined;
  readiness: string | undefined;
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className="cpm-fact" role="listitem">
    <span className="cpm-fact__label">{label}</span>
    <span className="cpm-fact__value">{children}</span>
  </span>
);

const readinessTone = (r: string | undefined) => r === 'COMPLETE' ? 'good' : r === 'FAILED' ? 'bad' : 'muted';

export const EvidenceHeaderStrip: React.FC<EvidenceHeaderStripProps> = ({ selection, run, entry, loopName, readiness }) => {
  const ageMs = run ? Date.now() - new Date(run.computedAt).getTime() : null;
  return (
    <>
      <WorkspaceHeader
        eyebrow="Understand the cause · Evidence workbench"
        title={`${selection.loopId}${loopName ? ` · ${loopName}` : ''} — ${selection.gate}${entry ? ` ${entry.name}` : ''}`}
        // CHG-050: the gate definition lives in Explain → "What this gate asks"; the header keeps the page short.
      />
      <div className="cpm-fact-row">
        <div className="cpm-fact-row__facts" role="list" aria-label="Run facts">
          {run?.support.sampleCount != null && <Fact label="Coverage">{`${run.support.sampleCount.toLocaleString('en-GB')} samples`}</Fact>}
          <Fact label="Mode">
            <TonePill tone="muted">{selection.mode}</TonePill>
            {run && run.identity.purpose !== 'LIVE' && <TonePill tone="warn">{run.identity.purpose}</TonePill>}
          </Fact>
          <Fact label="Evidence"><TonePill tone={readinessTone(readiness)}>{readiness ?? '…'}</TonePill></Fact>
          <Fact label="Age">{ageMs != null ? `computed ${fmtDuration(ageMs)} ago` : '—'}</Fact>
          <Fact label="Run"><CopyableId label="run id" value={selection.methodRunId} /></Fact>
        </div>
      </div>
    </>
  );
};
