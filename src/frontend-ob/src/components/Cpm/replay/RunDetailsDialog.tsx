/**
 * Task 18: Run details for the open window on Replay (it replaced the Workbench Identity tab as a stand-in): which run
 * wrote the result, under which bundle and engine build, and whether its proof is retained. Retained is not sufficient.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import { windowLabel } from '../windowLabel';
import { gateTally } from '../calc/calcView';
import { useEvidenceManifest } from '../evidence/useEvidence';

const dash = (v: string | number | null | undefined) => (v == null || v === '' ? 'Not reported' : String(v));
const short = (v: string | null | undefined) => (v ? v.slice(0, 12) : null);

export const RunDetailsDialog: React.FC<{
  open: boolean; onClose: () => void; row: CpmGateMatrix; timeZone: string;
}> = ({ open, onClose, row, timeZone }) => {
  const m = row.metadata;
  const manifest = useEvidenceManifest(open ? row.methodRunIds?.G15 : undefined);
  const readiness = manifest.data?.readiness;
  const tally = gateTally(row.gates ?? [], row.diagnosis);
  return (
    <Dialog open={open} onClose={onClose} title="Run details"
      footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      <KvRow label="Window">{windowLabel(row, timeZone)}</KvRow>
      <KvRow label="Result">{m.replayId ? `Re-run ${m.replayId}` : 'Original run'}</KvRow>
      <KvRow label="Samples">{row.sampleCount != null ? row.sampleCount.toLocaleString('en-US') : 'Not reported'}</KvRow>
      {tally.total > 0 && (
        <KvRow label="Gates">{`${tally.total} gates · ${tally.review} need review · ${tally.notJudged} not judged`}</KvRow>
      )}
      <KvRow label="Decision run (G15)">{dash(row.methodRunIds?.G15)}</KvRow>
      <KvRow label="Bundle">{dash(short(row.bundleHash))}</KvRow>
      <KvRow label="Calculation">{`v${dash(m.calculationVersion)} · profile v${dash(m.dynamicsProfileVersion)}`}</KvRow>
      <KvRow label="Engine build">{dash(short(m.sourceCommit) ?? short(m.jarSha256))}</KvRow>
      <KvRow label="Computed">{dash(m.computedAt)}</KvRow>
      <KvRow label="Proof retained">
        {readiness && readiness !== 'NONE' ? <TonePill tone={readiness === 'COMPLETE' ? 'good' : readiness === 'FAILED' ? 'bad' : 'muted'}>{readiness}</TonePill> : 'Not held'}
      </KvRow>
      <p className="cpm-copy">Complete retention shows the proof was kept, not that it was sufficient.</p>
    </Dialog>
  );
};
