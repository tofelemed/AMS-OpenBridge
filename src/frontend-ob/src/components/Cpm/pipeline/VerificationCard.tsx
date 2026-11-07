/**
 * End-to-end verification: a setup dialog (our loop control), then the engine's real run states and identity.
 * Permissions are what the action needed before: cpm.manage, with the reason on screen.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { KvRow, PanelHead, TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { LoopBand } from '../context/LoopBand';

export interface ReplayState { replayId: string; jobId: string; state: string; finished: boolean; succeeded: boolean }

export const VerificationCard: React.FC<{
  loopId: string | undefined;
  onLoop: (loopId: string) => void;
  canManage: boolean;
  busy: boolean;
  error: string | null;
  status: ReplayState | null | undefined;
  analysisRunId: string | null;
  elapsedS: number | null;
  onRun: () => void;
}> = ({ loopId, onLoop, canManage, busy, error, status, analysisRunId, elapsedS, onRun }) => {
  const [setup, setSetup] = useState(false);
  const reason = !canManage ? 'Needs the cpm.manage permission' : !loopId ? 'No loop has a verdict to use as the reference yet' : null;
  return (
    <section className="cpm-surface">
      <PanelHead title="End-to-end verification"
        help={<Toggletip variant="how-to" label="What the verification does">
          <p>Submits an A8 recompute on the chosen loop and waits for the batch verdict: historian read, normalise, gates, fused result in Postgres.</p>
        </Toggletip>}
        right={status && (
          <TonePill tone={status.finished ? (status.succeeded ? 'good' : 'bad') : 'warn'}>
            {status.finished ? (status.succeeded ? 'VERIFIED' : `FAILED (${status.state})`) : status.state}
          </TonePill>
        )} />
      <div className="cpm-filter-row">
        <ReasonedButton variant="raised" disabled={!loopId || !canManage || busy} reason={reason} onClick={() => setSetup(true)}>
          {busy ? 'Verifying…' : 'Run end-to-end verification'}
        </ReasonedButton>
        {error && <span className="cpm-field__error">Failed to start: {error}</span>}
      </div>
      {status && (
        <>
          {loopId && <KvRow label="Loop">{loopId}</KvRow>}
          {analysisRunId && <KvRow label="Analysis run"><span className="cpm-pipeline-id">{analysisRunId}</span></KvRow>}
          {status.finished && elapsedS != null && <KvRow label="Round trip">{status.succeeded ? 'Completed' : 'Failed'} in {elapsedS} s</KvRow>}
          <TechnicalDetails items={[
            { label: 'Replay id', value: status.replayId },
            { label: 'Engine job id', value: status.jobId },
          ]} />
        </>
      )}
      <Dialog open={setup} title="Run end-to-end verification" onClose={() => setSetup(false)}
        footer={(
          <>
            <ObcButton variant="flat" onClick={() => setSetup(false)}>Cancel</ObcButton>
            <ObcButton variant="raised" disabled={!loopId} onClick={() => { setSetup(false); onRun(); }}>Start verification</ObcButton>
          </>
        )}>
        <LoopBand loopId={loopId} onLoop={onLoop} />
      </Dialog>
    </section>
  );
};

export default VerificationCard;
