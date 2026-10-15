/**
 * CHG-098 (SME review 2 #28): what an edit changes, before -> after, and the expected effect of each kind of
 * change, in one short plain sentence. Unchanged settings are left out so the reviewer reads only the edit.
 */
import { SIGNAL_ROLES } from '../../plantLocation';
import { applicabilitySummary } from '../../optionalInputs';
import { isExplicit, type ModelForm } from './ClassificationStep';
import type { WizardState } from './wizardForm';

export interface SettingChange { key: string; label: string; before: string; after: string; effect: string }

const NONE = 'not set';

export function modelSummary(model: ModelForm, loopType: string): string {
  if (!isExplicit(model)) return `preset from loop type ${loopType}`;
  const dims = [model.serviceFamily, model.dynamicClass, model.objectiveType, model.topology, model.commandPath].filter(Boolean);
  return `EXPLICIT — ${dims.join(' · ') || 'acquisition only'}`;
}

/** "0–250 kg/h", or "not declared". */
export function rangeText(min: string, max: string, unit = ''): string {
  const lo = min.trim(), hi = max.trim(), u = unit.trim();
  if (!lo && !hi) return u ? `not declared (unit ${u})` : 'not declared';
  return `${lo || '?'}–${hi || '?'}${u ? ` ${u}` : ''}`;
}

export const locationText = (f: Pick<WizardState, 'site' | 'area' | 'unit'>): string =>
  [f.site, f.area, f.unit].map(s => s.trim()).filter(Boolean).join(' / ') || NONE;

const EFFECT = {
  path: 'The engine reads the new path from the next window; results already stored stay as they were.',
  pvRange: 'Error as % of PV span and the good-error band (G3) use the new range from the next window.',
  opRange: 'Saturation (G10) and operating-region limits use the new OP range from the next window.',
  vp: 'Changes whether a valve cause can be confirmed from position feedback (G14) and whether a missing VP is flagged.',
  peers: 'Changes whether peer interaction (G13) is evaluated for this loop.',
  monitoringOff: 'No new results are produced after saving; stored history stays.',
  monitoringOn: 'Results start again from the next complete window.',
  model: 'Diagnosis uses the new loop model from the next window.',
  profile: 'Gate thresholds from this profile apply from the next window.',
  criticality: 'Changes where the loop ranks in fleet lists; results are unchanged.',
  label: 'Changes names and plant filters only; results are unchanged.',
} as const;

const ROLE_LABEL: Record<string, string> = { pv: 'PV path', sp: 'SP path', op: 'OP path', mode: 'MODE path', vp: 'VP path' };

/** The changed settings of an edit, in reading order. */
export function diffSettings(before: WizardState, after: WizardState): SettingChange[] {
  const out: SettingChange[] = [];
  const push = (key: string, label: string, b: string, a: string, effect: string) => {
    if (b !== a) out.push({ key, label, before: b || NONE, after: a || NONE, effect });
  };
  const t = (s: string) => s.trim();
  push('displayName', 'Service', t(before.displayName), t(after.displayName), EFFECT.label);
  push('location', 'Location', locationText(before), locationText(after), EFFECT.label);
  push('loopType', 'Loop type', before.loopType, after.loopType, EFFECT.model);
  push('model', 'Loop model', modelSummary(before.model, before.loopType), modelSummary(after.model, after.loopType), EFFECT.model);
  push('criticality', 'Criticality', before.criticality, after.criticality, EFFECT.criticality);
  push('thresholdProfileId', 'Gate profile', t(before.thresholdProfileId) || 'default', t(after.thresholdProfileId) || 'default', EFFECT.profile);
  for (const role of SIGNAL_ROLES) push(role, ROLE_LABEL[role], t(before[role]), t(after[role]), EFFECT.path);
  push('pvRange', 'PV range', rangeText(before.pvMin, before.pvMax, before.pvUnit), rangeText(after.pvMin, after.pvMax, after.pvUnit), EFFECT.pvRange);
  push('opRange', 'OP range', rangeText(before.opMin, before.opMax), rangeText(after.opMin, after.opMax), EFFECT.opRange);
  const vp = (f: WizardState) => applicabilitySummary(f.vpApplicability, '').split(' · ')[0];
  push('vpApplicability', 'Valve position', vp(before), vp(after), EFFECT.vp);
  const peers = (f: WizardState) => applicabilitySummary('', f.peerApplicability).split(' · ')[1] ?? '';
  push('peerApplicability', 'Interacting loops', peers(before), peers(after), EFFECT.peers);
  push('enableMonitoring', 'Monitoring', before.enableMonitoring ? 'on' : 'off', after.enableMonitoring ? 'on' : 'off',
    after.enableMonitoring ? EFFECT.monitoringOn : EFFECT.monitoringOff);
  return out;
}
