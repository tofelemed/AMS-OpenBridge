/**
 * Task 18: Run details for the open window (Replay and Calculations): the gate tally, when the result was computed, and whether
 * its proof is retained. Retained is not sufficient. CHG-166 (owner review): the window, the result (original or re-run) and the
 * samples are not repeated here, each page's foot strip says them; Computed reads as a time with its zone. CHG-184 (owner review
 * item 0): no decision run id, bundle hash, calculation and profile versions or engine build.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import { fmtInstant } from '../context/LoopContextBar';
import { gateTally } from '../calc/calcView';
import { useEvidenceManifest } from '../evidence/useEvidence';

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
      {tally.total > 0 && (
        <KvRow label="Gates">{`${tally.total} gates · ${tally.review} need review · ${tally.notJudged} not judged`}</KvRow>
      )}
      <KvRow label="Computed">{m.computedAt ? fmtInstant(m.computedAt, timeZone) : 'Not reported'}</KvRow>
      <KvRow label="Proof retained">
        {readiness && readiness !== 'NONE' ? <TonePill tone={readiness === 'COMPLETE' ? 'good' : readiness === 'FAILED' ? 'bad' : 'muted'}>{readiness}</TonePill> : 'Not held'}
      </KvRow>
      <p className="cpm-copy">Complete retention shows the proof was kept, not that it was sufficient.</p>
    </Dialog>
  );
};
