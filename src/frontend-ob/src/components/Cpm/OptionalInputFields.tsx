/**
 * SME review #23 (CHG-059): the engineer states whether valve position (VP) and peer links are expected on this loop.
 * Blank = derived (VP from the command path; peers expected). Only an expected-but-unmapped input is a gap.
 */
import React from 'react';
import { APPLICABILITY_OPTIONS } from './optionalInputs';

export interface OptionalInputForm { vpApplicability: string; peerApplicability: string }

export const OptionalInputFields: React.FC<{
  form: OptionalInputForm;
  onChange: (k: keyof OptionalInputForm) => (e: React.ChangeEvent<HTMLSelectElement>) => void;
}> = ({ form, onChange }) => (
  <div className="cpm-wizard-grid" style={{ marginTop: 12 }}>
    <label className="cpm-field">
      <span className="cpm-field__label">Valve position on this loop</span>
      <select className="cpm-select" value={form.vpApplicability} onChange={onChange('vpApplicability')}>
        {APPLICABILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="cpm-copy">Not installed: a valve without positioner feedback. Not applicable: no valve (drive, direct action).</span>
    </label>
    <label className="cpm-field">
      <span className="cpm-field__label">Interacting loops (G13)</span>
      <select className="cpm-select" value={form.peerApplicability} onChange={onChange('peerApplicability')}>
        {APPLICABILITY_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.value === '' ? 'Derive (expected)' : o.label}</option>
        ))}
      </select>
      <span className="cpm-copy">Not applicable: a stand-alone loop with no upstream or peer loop to check against.</span>
    </label>
  </div>
);

/** The applicability keys to send; blank ones are omitted so the server keeps deriving. */
export function applicabilityOf(f: OptionalInputForm): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.vpApplicability) out.vpApplicability = f.vpApplicability;
  if (f.peerApplicability) out.peerApplicability = f.peerApplicability;
  return out;
}
