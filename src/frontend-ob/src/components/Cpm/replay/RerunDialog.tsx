/**
 * Task 18 (spec section 12, decision 3): confirm a re-run of the open window. The window and the settings it ran under are
 * fixed; the current configuration is not offered (listed under Not in this release). No promise of an identical result.
 * A finished run opens in the Workbench; the original stays on Replay.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import type { useRerun } from './useRerun';

export const RerunDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  windowText: string;
  state: ReturnType<typeof useRerun>;
  onCreate: () => void;
  onOpenRun: () => void;
}> = ({ open, onClose, windowText, state, onCreate, onOpenRun }) => {
  const { status, refusal, unreadable, stillRunning, cached, verdictRunId, noResult, busy, started, run, checkAgain } = state;
  const line = refusal ? null
    : unreadable ? { tone: 'bad' as const, pill: 'Unknown', text: "The run's state could not be read. It may still finish." }
    : stillRunning ? { tone: 'warn' as const, pill: run?.state ?? 'RUNNING', text: 'Still running. Check again in a minute.' }
    : noResult ? { tone: 'warn' as const, pill: 'FINISHED', text: 'The run ended without a stored result yet.' }
    : verdictRunId && cached ? { tone: 'good' as const, pill: 'FINISHED', text: 'A run was already made for this window, so it was opened instead of a new one. Evidence is held 3 days.' }
    : started && status ? { tone: status.tone, pill: run?.state ?? 'QUEUED', text: status.text }
    : null;
  return (
    <Dialog open={open} onClose={onClose} title="Re-run this window"
      description="It uses the settings the window ran under, or the engine default if none are held, and today's engine build. The result can differ from the original."
      footer={<>
        <ObcButton variant="flat" onClick={onClose}>Close</ObcButton>
        {(unreadable || stillRunning || noResult) && <ObcButton variant="normal" onClick={checkAgain}>Check again</ObcButton>}
        {verdictRunId && <ObcButton variant="normal" onClick={onOpenRun}>Open the new run ↗</ObcButton>}
        {!verdictRunId && <ObcButton variant="raised" disabled={busy} onClick={onCreate}>{busy ? 'Running…' : 'Create run'}</ObcButton>}
      </>}>
      <KvRow label="Window">{windowText}</KvRow>
      <fieldset className="cpm-rerun-config">
        <legend className="cpm-field__label">Configuration</legend>
        <label className="cpm-check">
          <input type="radio" name="rerun-config" checked readOnly /> Settings of this window
        </label>
        <label className="cpm-check">
          <input type="radio" name="rerun-config" disabled /> Current configuration
        </label>
        <span className="cpm-reasoned__why">Not available in this release.</span>
      </fieldset>
      {refusal && <p role="alert"><TonePill tone="bad">Not started</TonePill> {refusal}</p>}
      {line && <p role={line.tone === 'bad' ? 'alert' : 'status'}><TonePill tone={line.tone}>{line.pill}</TonePill> {line.text}</p>}
    </Dialog>
  );
};
