/**
 * Task 18 (spec section 12, decision 3): confirm a re-run of the open window. The window and its governed bundle are fixed;
 * the current configuration is not offered (listed under Not in this release). No promise of an identical result.
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
  onCompare: () => void;
}> = ({ open, onClose, windowText, state, onCreate, onCompare }) => {
  const { status, refusal, unreadable, cached, finished, busy, started, run } = state;
  return (
    <Dialog open={open} onClose={onClose} title="Re-run this window"
      description="It uses the window's governed bundle and today's engine build, so the result can differ from the original."
      footer={<>
        <ObcButton variant="flat" onClick={onClose}>Close</ObcButton>
        {finished && <ObcButton variant="normal" onClick={onCompare}>Compare with the original ↗</ObcButton>}
        {!finished && <ObcButton variant="raised" disabled={busy} onClick={onCreate}>{busy ? 'Running…' : 'Create run'}</ObcButton>}
      </>}>
      <KvRow label="Window">{windowText}</KvRow>
      <fieldset className="cpm-rerun-config">
        <legend className="cpm-field__label">Configuration</legend>
        <label className="cpm-check">
          <input type="radio" name="rerun-config" checked readOnly /> Governed bundle of this window
        </label>
        <label className="cpm-check">
          <input type="radio" name="rerun-config" disabled /> Current configuration
        </label>
        <span className="cpm-reasoned__why">Not available in this release.</span>
      </fieldset>
      {refusal && <p role="alert"><TonePill tone="bad">Not started</TonePill> {refusal}</p>}
      {!refusal && started && status && <p role="status"><TonePill tone={status.tone}>{run?.state ?? 'QUEUED'}</TonePill> {status.text}</p>}
      {cached && finished && <p className="cpm-copy">A run was already made for this window, so it was opened instead of a new one. Evidence is held 3 days.</p>}
      {unreadable && <p role="alert"><TonePill tone="bad">Unknown</TonePill> The run's state could not be read. It may still finish; reload to check.</p>}
    </Dialog>
  );
};
