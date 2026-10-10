/**
 * SME review #23 (CHG-059): the engineer states whether valve position (VP) and peer links are expected on this loop.
 * Only an expected-but-unmapped input is a gap. CHG-077: VP is one yes/no fact — "this loop has a valve position" —
 * saved explicitly (EXPECTED / NOT_APPLICABLE); unticked, the loop is never shown as missing it.
 */
import React from 'react';
import { APPLICABILITY_OPTIONS } from './optionalInputs';

export interface OptionalInputForm { vpApplicability: string; peerApplicability: string }

/** The checkbox state: ticked unless the loop is declared without a valve position. */
export const hasVpChecked = (vpApplicability: string): boolean =>
  vpApplicability !== 'NOT_APPLICABLE' && vpApplicability !== 'NOT_INSTALLED';

export const OptionalInputFields: React.FC<{
  form: OptionalInputForm;
  onChange: (k: keyof OptionalInputForm) => (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** CHG-077: set the VP declaration directly (EXPECTED / NOT_APPLICABLE). */
  onVpChange: (value: 'EXPECTED' | 'NOT_APPLICABLE') => void;
}> = ({ form, onChange, onVpChange }) => (
  <div className="cpm-wizard-grid" style={{ marginTop: 12 }}>
    <div className="cpm-field">
      <span className="cpm-field__label">Valve position</span>
      <label className="cpm-check">
        <input type="checkbox" checked={hasVpChecked(form.vpApplicability)}
          onChange={e => onVpChange(e.target.checked ? 'EXPECTED' : 'NOT_APPLICABLE')} />
        <span>This loop has a valve position (positioner feedback)</span>
      </label>
      <span className="cpm-copy">
        Untick for a valve without positioner feedback, a drive or a direct action: the loop is then never shown as
        degraded or "VP not mapped". Ticked but not mapped, it is degraded and a valve cause stops at suspected.
      </span>
    </div>
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
