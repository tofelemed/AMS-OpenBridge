/**
 * CHG-170 (owner review, Pipeline Health): end-to-end verification, under the job panel. Its state once in the head (○ Not run /
 * ◐ Running / ✓ Verified / ✕ Failed, in words); the run's Loop (tag and name), Round trip and Results; Record details (the
 * analysis run, replay and engine job ids, short and copyable; they were Technical details) and Run end-to-end verification in
 * the foot. The setup dialog in titled parts: Loop (our loop control) and What it does (the ? sentence, "an A8" dropped).
 * Owner answer 3a: Verified only when the run wrote results. Unchanged: the start needs cpm.manage and says why when disabled;
 * "Verifying…" blocks a second start until the run reports finished; Check again when the state cannot be read.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { LoopBand } from '../context/LoopBand';
import { DetailsDialog } from '../config/DetailsDialog';
import { CopyableId } from '../evidence/CopyableId';
import { resultsText, verificationHead, type ReplayState } from './verificationState';

export type { ReplayState } from './verificationState';

export const WHAT_IT_DOES = 'Submits a recompute on this loop and waits for the batch verdict: historian read, normalise, gates, fused result in Postgres.';

export const VerificationCard: React.FC<{
  loopId: string | undefined;
  /** Why no loop can be run yet (loading, none registered); null when a loop is chosen. */
  loopReason: string | null;
  /** The loop the run on screen used; the chosen loop may have changed since. */
  runLoopId: string | null;
  /** A loop's service name for the Loop row ("Flow controller (FCS0101)"), '' when none. */
  nameOf: (loopId: string) => string;
  /** A run was submitted and has not been cleared. */
  started: boolean;
  /** The start request is on its way. */
  pending: boolean;
  onRecheck: () => void;
  onLoop: (loopId: string) => void;
  canManage: boolean;
  busy: boolean;
  error: string | null;
  status: ReplayState | null | undefined;
  analysisRunId: string | null;
  elapsedS: number | null;
  onRun: () => void;
}> = ({ loopId, loopReason, runLoopId, nameOf, started, pending, onRecheck, onLoop, canManage, busy, error, status, analysisRunId, elapsedS, onRun }) => {
  const [setup, setSetup] = useState(false);
  const [record, setRecord] = useState(false);
  const head = verificationHead({ started, pending, status });
  const results = resultsText(status);
  const reason = !canManage ? 'Needs the cpm.manage permission' : !loopId ? loopReason : null;
  const name = runLoopId ? nameOf(runLoopId) : '';
  return (
    <section className="ui-inspector cpm-pipeline-ver" aria-labelledby="pipeline-ver-title">
      <div className="ui-inspector__head">
        <h2 id="pipeline-ver-title" className="ui-inspector__title">End-to-end verification</h2>
        <span className="ui-inspector__meta"><TonePill tone={head.tone} glyph={head.glyph}>{head.word}</TonePill></span>
      </div>
      {(started || error) && (
        <div className="ui-inspector__body">
          {started && runLoopId && <KvRow label="Loop"><strong>{runLoopId}</strong>{name && <span className="cpm-copy"> {name}</span>}</KvRow>}
          {started && !status && (
            <div className="cpm-filter-row">
              <span className="cpm-field__error">Could not read the run state. The run may still be going.</span>
              <ObcButton variant="flat" onClick={onRecheck}>Check again</ObcButton>
            </div>
          )}
          {status?.finished && elapsedS != null && <KvRow label="Round trip">{status.succeeded ? 'Completed' : 'Failed'} in {elapsedS} s</KvRow>}
          {results && <KvRow label="Results">{results}</KvRow>}
          {error && <p className="cpm-field__error">Failed to start: {error}</p>}
        </div>
      )}
      <div className="ui-inspector__foot cpm-pipeline-ver__foot">
        {started && <ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton>}
        <ReasonedButton variant="raised" disabled={!loopId || !canManage || busy} reason={reason} onClick={() => setSetup(true)}>
          {busy ? 'Verifying…' : 'Run end-to-end verification'}
        </ReasonedButton>
      </div>
      <Dialog open={setup} title="Run end-to-end verification" onClose={() => setSetup(false)}
        footer={(
          <>
            <ObcButton variant="flat" onClick={() => setSetup(false)}>Cancel</ObcButton>
            <ObcButton variant="raised" disabled={!loopId} onClick={() => { setSetup(false); onRun(); }}>Start verification</ObcButton>
          </>
        )}>
        <div className="cpm-howto">
          <section className="cpm-howto__part" aria-label="Loop">
            <h3 className="cpm-howto__title">Loop</h3>
            <LoopBand loopId={loopId} onLoop={onLoop} />
          </section>
          <section className="cpm-howto__part" aria-label="What it does">
            <h3 className="cpm-howto__title">What it does</h3>
            <p className="cpm-copy">{WHAT_IT_DOES}</p>
          </section>
        </div>
      </Dialog>
      <DetailsDialog title="Record details" open={record} onClose={() => setRecord(false)} rows={[
        { label: 'Analysis run', value: analysisRunId ? <CopyableId label="analysis run id" value={analysisRunId} /> : 'Run id not returned' },
        { label: 'Replay id', value: <CopyableId label="replay id" value={status?.replayId} chars={status?.replayId.length} /> },
        { label: 'Engine job id', copy: status?.jobId ?? null },
      ]} />
    </section>
  );
};

export default VerificationCard;
