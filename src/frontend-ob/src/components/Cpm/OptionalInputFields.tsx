/**
 * SME review #23 (CHG-059): the engineer states whether valve position (VP) and peer links are expected on this loop.
 * Only an expected-but-unmapped input is a gap. CHG-077: VP is saved explicitly; a loop without one is never shown as missing it.
 * CHG-168 (owner answer 3b): Valve position offers the three values the API accepts, Expected / Not installed / Not applicable
 * (the checkbox could only save Expected or Not applicable; Not installed came from a CSV alone). Interacting loops drops Not
 * installed, which means nothing for peers, unless the loop already has it (an edit keeps what is stored). The explanations are
 * behind each ?.
 */
import React, { useId } from 'react';
import { Toggletip } from '../../ui/Toggletip';
import { APPLICABILITY_OPTIONS } from './optionalInputs';
import { Field } from './registry/wizard/editorParts';

export interface OptionalInputForm { vpApplicability: string; peerApplicability: string }

/** A valve position is expected on the loop (blank = derived, the previous behaviour for an unknown loop). */
export const hasVpChecked = (vpApplicability: string): boolean =>
  vpApplicability !== 'NOT_APPLICABLE' && vpApplicability !== 'NOT_INSTALLED';

const VP_CHOICES = APPLICABILITY_OPTIONS.filter(o => o.value !== '');

export const OptionalInputFields: React.FC<{
  form: OptionalInputForm;
  /** The stored peer applicability of an edited loop: Not installed stays offered when the loop has it. */
  storedPeers?: string;
  onChange: (k: keyof OptionalInputForm) => (e: React.ChangeEvent<HTMLSelectElement>) => void;
}> = ({ form, storedPeers, onChange }) => {
  const id = useId();
  const keepNotInstalled = form.peerApplicability === 'NOT_INSTALLED' || storedPeers === 'NOT_INSTALLED';
  const peerChoices = APPLICABILITY_OPTIONS.filter(o => o.value !== 'NOT_INSTALLED' || keepNotInstalled);
  return (
    <div className="cpm-reg-form-grid cpm-reg-form-grid--two">
      <Field id={`${id}-vp`} label="Valve position"
        help={(
          <Toggletip variant="how-to" label="Valve position choices">
            <p>Expected: the valve has positioner feedback. Not mapped, the loop is degraded and a valve cause stops at suspected.</p>
            <p>Not installed: a valve without positioner feedback, so a valve cause is suspected, not confirmed.</p>
            <p>Not applicable: a drive or a direct action, with no valve.</p>
            <p>Not installed or not applicable, the loop is never shown as degraded or "VP not mapped".</p>
          </Toggletip>
        )}>
        <select id={`${id}-vp`} className="cpm-select" value={form.vpApplicability || 'EXPECTED'} onChange={onChange('vpApplicability')}>
          {VP_CHOICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field id={`${id}-peers`} label="Interacting loops (G13)"
        help={(
          <Toggletip variant="how-to" label="Interacting loops choices">
            <p>Not applicable: a stand-alone loop with no upstream or peer loop to check against.</p>
          </Toggletip>
        )}>
        <select id={`${id}-peers`} className="cpm-select" value={form.peerApplicability} onChange={onChange('peerApplicability')}>
          {peerChoices.map(o => <option key={o.value} value={o.value}>{o.value === '' ? 'Derive (expected)' : o.label}</option>)}
        </select>
      </Field>
    </div>
  );
};

/** The applicability keys to send; blank ones are omitted so the server keeps deriving. */
export function applicabilityOf(f: OptionalInputForm): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.vpApplicability) out.vpApplicability = f.vpApplicability;
  if (f.peerApplicability) out.peerApplicability = f.peerApplicability;
  return out;
}
