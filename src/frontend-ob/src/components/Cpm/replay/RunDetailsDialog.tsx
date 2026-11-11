/**
 * Task 18: Run details for the open window (Replay and Calculations): which run wrote the result, under which bundle and engine
 * build, and whether its proof is retained. Retained is not sufficient. CHG-166 (owner review): the window, the result (original
 * or re-run) and the samples are not repeated here, each page's foot strip says them; Computed reads as a time with its zone.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import { fmtInstant } from '../context/LoopContextBar';
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
      {tally.total > 0 && (
        <KvRow label="Gates">{`${tally.total} gates · ${tally.review} need review · ${tally.notJudged} not judged`}</KvRow>
      )}
      <KvRow label="Decision run (G15)">{dash(row.methodRunIds?.G15)}</KvRow>
      <KvRow label="Bundle">{dash(short(row.bundleHash))}</KvRow>
      <KvRow label="Calculation">{`v${dash(m.calculationVersion)} · profile v${dash(m.dynamicsProfileVersion)}`}</KvRow>
      <KvRow label="Engine build">{dash(short(m.sourceCommit) ?? short(m.jarSha256))}</KvRow>
      <KvRow label="Computed">{m.computedAt ? fmtInstant(m.computedAt, timeZone) : dash(null)}</KvRow>
      <KvRow label="Proof retained">
        {readiness && readiness !== 'NONE' ? <TonePill tone={readiness === 'COMPLETE' ? 'good' : readiness === 'FAILED' ? 'bad' : 'muted'}>{readiness}</TonePill> : 'Not held'}
      </KvRow>
      <p className="cpm-copy">Complete retention shows the proof was kept, not that it was sufficient.</p>
    </Dialog>
  );
};
