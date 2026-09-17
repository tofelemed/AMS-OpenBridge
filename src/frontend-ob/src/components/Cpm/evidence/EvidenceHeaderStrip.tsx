/**
 * v2.5 workbench (audit F13): what the reader is looking at, as ONE row of labelled facts that never
 * overlap - the window in the site zone with its samples, the selection mode, the evidence readiness,
 * the computed age and the run id - and the window navigation (newer / older / newest). Identity
 * hashes live in the explain panel; here only what places the run in time.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { MethodRun } from '../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../api/cpm/catalogue';
import { TonePill, WorkspaceHeader, fmtDuration } from '../shared';
import { formatInZone, zoneLabel } from './timezone';
import type { EvidenceSelection } from './selection';
import { CopyableId } from './CopyableId';

export interface WindowNav {
  newer: (() => void) | null;
  older: (() => void) | null;
  newest: (() => void) | null;
  atNewest: boolean;
  /** False when the run's window is not in the listed windows of the chosen kind (steppers disabled, reason in the title). */
  inList: boolean;
}

export interface EvidenceHeaderStripProps {
  selection: EvidenceSelection;
  run: MethodRun | undefined;
  entry: GateCatalogueEntry | undefined;
  loopName: string | undefined;
  timeZone: string;
  readiness: string | undefined;
  nav: WindowNav;
  reconstruct?: { onClick: () => void; busy: boolean };
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className="cpm-fact" role="listitem">
    <span className="cpm-fact__label">{label}</span>
    <span className="cpm-fact__value">{children}</span>
  </span>
);

const readinessTone = (r: string | undefined) => r === 'COMPLETE' ? 'good' : r === 'FAILED' ? 'bad' : 'muted';

export const EvidenceHeaderStrip: React.FC<EvidenceHeaderStripProps> = ({ selection, run, entry, loopName, timeZone, readiness, nav, reconstruct }) => {
  const from = run?.support.fromMs, to = run?.support.toMs;
  const ageMs = run ? Date.now() - new Date(run.computedAt).getTime() : null;
  const notListed = 'This run\'s window is not in the listed windows of the chosen kind';
  return (
    <>
      <WorkspaceHeader
        eyebrow="Evidence workbench"
        title={`${selection.loopId}${loopName ? ` · ${loopName}` : ''} — ${selection.gate}${entry ? ` ${entry.name}` : ''}`}
        copy={entry?.definition ?? 'The exact intermediates of one method run.'}
      />
      <div className="cpm-fact-row">
        <div className="cpm-fact-row__facts" role="list" aria-label="Run facts">
          <Fact label="Window">
            {from != null && to != null
              ? `${run?.windowKind} · ${formatInZone(from, timeZone)} → ${formatInZone(to, timeZone)} · ${zoneLabel(timeZone, from)}${run?.support.sampleCount != null ? ` · ${run.support.sampleCount.toLocaleString('en-GB')} samples` : ''}`
              : '—'}
          </Fact>
          <Fact label="Mode">
            <TonePill tone="muted">{selection.mode}</TonePill>
            {run && run.identity.purpose !== 'LIVE' && <TonePill tone="warn">{run.identity.purpose}</TonePill>}
          </Fact>
          <Fact label="Evidence"><TonePill tone={readinessTone(readiness)}>{readiness ?? '…'}</TonePill></Fact>
          <Fact label="Age">{ageMs != null ? `computed ${fmtDuration(ageMs)} ago` : '—'}</Fact>
          <Fact label="Run"><CopyableId label="run id" value={selection.methodRunId} /></Fact>
        </div>
        <div className="cpm-fact-row__actions">
          <ObcButton variant="flat" disabled={!nav.newer} title={!nav.inList ? notListed : nav.atNewest ? 'Already the newest window' : undefined} onClick={() => nav.newer?.()}>‹ Newer</ObcButton>
          <ObcButton variant="flat" disabled={!nav.older} title={!nav.inList ? notListed : undefined} onClick={() => nav.older?.()}>Older ›</ObcButton>
          <ObcButton variant="normal" disabled={!nav.newest || nav.atNewest} title={nav.atNewest ? 'Already the newest window' : undefined} onClick={() => nav.newest?.()}>Newest</ObcButton>
          {reconstruct && (
            <ObcButton variant="normal" disabled={reconstruct.busy} onClick={reconstruct.onClick}>{reconstruct.busy ? 'Reconstruction requested…' : 'Reconstruct evidence'}</ObcButton>
          )}
        </div>
      </div>
    </>
  );
};
