/**
 * CHG-189 (owner review item 12): the new-note form in the Loop notes dialog, as the dialog's label / value rows (sentence-case
 * labels, no caps "OUTCOME"). The fields are those of SME review #22 (CHG-058): the text, the outcome, attaching the window on
 * screen (its decision evidence is then kept) and, only when the loop has an open episode, acknowledging it as a separate,
 * explicit choice (ISA-18.2). The draft lives with the button, so closing the dialog keeps what was typed.
 */
import React, { useId } from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { MAX_NOTE_LENGTH, type NoteOutcome } from '../../../api/cpm/investigations';
import { Toggletip } from '../../../ui/Toggletip';
import { OUTCOMES, type NoteDraft } from './noteText';

export const NoteForm: React.FC<{
  draft: NoteDraft;
  onDraft: (d: NoteDraft) => void;
  /** The evaluated window on screen: its decision run (G15) and a short name. */
  window?: { methodRunId?: string | null; label: string } | null;
  /** The loop's open, unacknowledged episode, if any. */
  openFrame?: CpmEventFrame | null;
}> = ({ draft, onDraft, window, openFrame }) => {
  const id = useId();
  const set = (patch: Partial<NoteDraft>) => onDraft({ ...draft, ...patch });
  const canAttach = !!window?.methodRunId;
  return (
    <div className="cpm-run-form cpm-note-form">
      <span className="cpm-run-form__label cpm-note-form__label">
        <label htmlFor={`${id}-text`}>Note</label>
        <Toggletip variant="how-to" label="About loop notes"><p>A note stays on the loop and never changes the engine’s result. Saving it never acknowledges an episode unless you tick that box; link it to an episode now or later.</p></Toggletip>
      </span>
      <div className="cpm-run-form__value">
        <textarea id={`${id}-text`} className="cpm-textarea" rows={3} value={draft.text} maxLength={MAX_NOTE_LENGTH + 1}
          placeholder="Observation, action taken, follow-up owner… (no episode needed)" onChange={e => set({ text: e.target.value })} />
      </div>
      <label className="cpm-run-form__label" htmlFor={`${id}-outcome`}>Outcome</label>
      <div className="cpm-run-form__value">
        <select id={`${id}-outcome`} className="cpm-select" value={draft.outcome} onChange={e => set({ outcome: e.target.value as NoteOutcome })}>
          {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {(canAttach || openFrame) && (
        <>
          <span aria-hidden="true" />
          <div className="cpm-run-form__value cpm-note-form__checks">
            {canAttach && (
              // CHG-160 (owner review): the band names the window; the box names it on hover only
              <label className="cpm-check" title={window?.label}>
                <input type="checkbox" checked={draft.attach} onChange={e => set({ attach: e.target.checked })} />
                Attach to this window — its evidence is kept
              </label>
            )}
            {openFrame && (
              <label className="cpm-check">
                <input type="checkbox" checked={draft.alsoAck} onChange={e => set({ alsoAck: e.target.checked })} />
                Also acknowledge the open episode EVT-{openFrame.id} and link the note to it
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NoteForm;
