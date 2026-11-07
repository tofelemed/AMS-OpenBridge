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
  /** The loop the run on screen used; the chosen loop may have changed since. */
  runLoopId: string | null;
  /** A run was submitted and has not been cleared. */
  started: boolean;
  onRecheck: () => void;
  onLoop: (loopId: string) => void;
  canManage: boolean;
  busy: boolean;
  error: string | null;
  status: ReplayState | null | undefined;
  analysisRunId: string | null;
  elapsedS: number | null;
  onRun: () => void;
}> = ({ loopId, runLoopId, started, onRecheck, onLoop, canManage, busy, error, status, analysisRunId, elapsedS, onRun }) => {
  const [setup, setSetup] = useState(false);
  const reason = !canManage ? 'Needs the cpm.manage permission' : !loopId ? 'No loop has a verdict to use as the reference yet' : null;
  return (
    <section className="cpm-surface">
      <PanelHead title="End-to-end verification"
        help={<Toggletip variant="how-to" label="What the verification does">
          <p>Submits an A8 recompute on the chosen loop and waits for the batch verdict: historian read, normalise, gates, fused result in Postgres.</p>
        </Toggletip>}
        right={status ? (
          <TonePill tone={status.finished ? (status.succeeded ? 'good' : 'bad') : 'warn'}>
            {status.finished ? (status.succeeded ? 'VERIFIED' : `FAILED (${status.state})`) : status.state}
          </TonePill>
        ) : started && <TonePill tone="warn">STATE UNKNOWN</TonePill>} />
      <div className="cpm-filter-row">
        <ReasonedButton variant="raised" disabled={!loopId || !canManage || busy} reason={reason} onClick={() => setSetup(true)}>
          {busy ? 'Verifying…' : 'Run end-to-end verification'}
        </ReasonedButton>
        {error && <span className="cpm-field__error">Failed to start: {error}</span>}
      </div>
      {started && (
        <>
          {runLoopId && <KvRow label="Loop">{runLoopId}</KvRow>}
          <KvRow label="Analysis run">
            {analysisRunId ? <span className="ui-technical__mono">{analysisRunId}</span> : 'Run id not returned'}
          </KvRow>
          {!status && (
            <div className="cpm-filter-row">
              <span className="cpm-field__error">Could not read the run state. The run may still be going.</span>
              <ObcButton variant="flat" onClick={onRecheck}>Check again</ObcButton>
            </div>
          )}
          {status?.finished && elapsedS != null && <KvRow label="Round trip">{status.succeeded ? 'Completed' : 'Failed'} in {elapsedS} s</KvRow>}
          {status && (
            <TechnicalDetails items={[
              { label: 'Replay id', value: status.replayId },
              { label: 'Engine job id', value: status.jobId },
            ]} />
          )}
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
