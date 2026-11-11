/**
 * CHG-168 (owner review): the editor's Signals tab. Signal paths: derived from the location and loop tag and overridable, each
 * with its pen colour and Copy, the derivation rule behind the ?; an empty VP field reads "Not mapped" (it showed the derived path
 * as a grey placeholder that looked like a value), and "+ add VP as …/<tag>.vp" fills it. Ranges (owner question 4): PV range
 * and unit, OP range, beside the paths they scale, the rule behind the ? (it read "OP rangenormalises" on screen). Optional
 * inputs: valve position and interacting loops; the VP warning stays on screen where it is true.
 */
import React from 'react';
import { Toggletip } from '../../../../ui/Toggletip';
import { NO_VP_COPY } from '../../investigation/confirmationCopy';
import { OptionalInputFields, hasVpChecked } from '../../OptionalInputFields';
import { deriveSignalPath, type SignalRole } from '../../plantLocation';
import { shortPath } from '../loopPanelFacts';
import type { FieldCheck, WizardState } from './wizardForm';
import { SignalPathField } from './SignalPathField';
import { Part } from './editorParts';

type RangeKey = 'pvMin' | 'pvMax' | 'opMin' | 'opMax' | 'pvUnit';

export const PATH_FIELDS: ReadonlyArray<readonly [SignalRole, string]> = [['pv', 'PV · Process variable *'], ['sp', 'SP · Setpoint *'],
  ['op', 'OP · Controller output *'], ['mode', 'MODE · Controller mode *'], ['vp', 'VP · Valve position']];

const RangeInput: React.FC<{ k: RangeKey; label: string; placeholder: string; form: WizardState; error?: string; set: SignalsTabProps['set'] }> =
  ({ k, label, placeholder, form, error, set }) => (
    <input className={`cpm-input${error ? ' cpm-input--error' : ''}`} aria-label={label} value={form[k]} onChange={set(k)}
      inputMode={k === 'pvUnit' ? undefined : 'decimal'} maxLength={k === 'pvUnit' ? 24 : undefined}
      aria-invalid={error ? true : undefined} placeholder={placeholder} />
  );

interface SignalsTabProps {
  form: WizardState;
  original?: WizardState;
  paths: Record<SignalRole, FieldCheck>;
  ranges: Partial<Record<RangeKey, string>>;
  set: (k: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onForm: (change: (f: WizardState) => WizardState) => void;
}

export const SignalsTab: React.FC<SignalsTabProps> = ({ form, original, paths, ranges, set, onForm }) => {
  const loc = { site: form.site, area: form.area, unit: form.unit };
  const errors = (keys: RangeKey[]) => keys.filter(k => ranges[k]).map(k => <span key={k} className="cpm-field__error">{ranges[k]}</span>);
  return (
    <>
      <Part title="Signal paths"
        help={<Toggletip variant="how-to" label="Signal paths"><p>Derived from the location and loop tag as site/[area/]unit/&lt;loop&gt;.&lt;role&gt;: edit any path to override it.</p></Toggletip>}>
        <div className="cpm-path-list">
          {PATH_FIELDS.map(([k, label]) => {
            const derived = deriveSignalPath(loc, form.loopId, k);
            const placeholder = k === 'vp' && derived ? 'Not mapped' : derived ? `Derived: ${derived}` : 'site/unit/loop.role';
            return (
              <SignalPathField key={k} id={`cpm-wizard-path-${k}`} label={label} pen={k} value={form[k]}
                placeholder={placeholder} check={paths[k]} onChange={set(k)}>
                {k === 'vp' && form.vp.trim() === '' && derived && (
                  <button type="button" className="cpm-pill cpm-pill--muted cpm-path-field__add" title={derived}
                    onClick={() => onForm(f => ({ ...f, vp: derived }))}>
                    + add VP as {shortPath(derived, loc)}
                  </button>
                )}
              </SignalPathField>
            );
          })}
        </div>
      </Part>
      <Part title="Ranges"
        help={(
          <Toggletip variant="how-to" label="Ranges">
            <p>Optional, and neither is cosmetic. PV range scales the good-error band G3 and OCE use: undeclared, that band is a fixed ±0.5 EU, which no temperature or flow loop in engineering units can meet.</p>
            <p>OP range normalises the output to 0–100 before saturation (G10) and operating-region (G2r) maths.</p>
            <p>Give both bounds of a range or neither; leave both blank to keep today's behaviour.</p>
          </Toggletip>
        )}>
        <div className="cpm-reg-range">
          <span className="ui-field__label">PV range</span>
          <RangeInput k="pvMin" label="PV minimum" placeholder="min" form={form} error={ranges.pvMin} set={set} />
          <span aria-hidden>–</span>
          <RangeInput k="pvMax" label="PV maximum" placeholder="max" form={form} error={ranges.pvMax} set={set} />
          <RangeInput k="pvUnit" label="PV unit" placeholder="unit: kg/h, °C, barg" form={form} error={ranges.pvUnit} set={set} />
        </div>
        {errors(['pvMin', 'pvMax', 'pvUnit'])}
        <div className="cpm-reg-range">
          <span className="ui-field__label">OP range</span>
          <RangeInput k="opMin" label="OP minimum" placeholder="min" form={form} error={ranges.opMin} set={set} />
          <span aria-hidden>–</span>
          <RangeInput k="opMax" label="OP maximum" placeholder="max" form={form} error={ranges.opMax} set={set} />
        </div>
        {errors(['opMin', 'opMax'])}
      </Part>
      <Part title="Optional inputs">
        <OptionalInputFields form={form} storedPeers={original?.peerApplicability} onChange={set} />
        {/* CHG-077: the G14 note only where it is true - a VP is declared and none is mapped */}
        {hasVpChecked(form.vpApplicability) && !form.vp.trim() && <p className="cpm-copy cpm-tone-warn">{NO_VP_COPY}</p>}
      </Part>
    </>
  );
};

export default SignalsTab;
