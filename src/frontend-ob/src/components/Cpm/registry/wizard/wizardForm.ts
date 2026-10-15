/**
 * The add / edit loop wizard's form model and its pure rules: prefill from a stored loop, path derivation,
 * the engineering payload, and (CHG-098 (SME review 2 #28)) the validation that blocks Continue with a reason.
 * Split out of AddLoopWizard.tsx so the wizard stays readable and the rules are unit-tested on their own.
 */
import type { CpmLoop } from '../../../../api/cpmApi';
import { isValidPvUnit } from '../../../../utils/escapeHtml';
import { SIGNAL_ROLES, deriveSignalPath, isResolvablePath, type PlantLocation, type SignalRole } from '../../plantLocation';
import { applicabilityOf, type OptionalInputForm } from '../../OptionalInputFields';
import { vpApplicabilityOf } from '../../optionalInputs';
import { emptyModelForm, type ModelForm } from './ClassificationStep';

export interface WizardState {
  loopId: string; displayName: string; site: string; area: string; unit: string;
  loopType: string; criticality: string;
  /** v2.5 (2G.1): the explicit loop model (blank = the loop_type preset). */
  model: ModelForm;
  pv: string; sp: string; op: string; mode: string; vp: string;
  thresholdProfileId: string; enableMonitoring: boolean;
  // Engineering ranges, held as strings so "not declared" stays distinguishable
  // from 0 — the API treats an omitted bound as undeclared and a 0 as a real one.
  pvMin: string; pvMax: string; opMin: string; opMax: string;
  /** CHG-047: the PV engineering unit, free text ("kg/h", "°C"); blank = not set. */
  pvUnit: string;
  /** CHG-059: '' = derived; else EXPECTED | NOT_INSTALLED | NOT_APPLICABLE. */
  vpApplicability: string; peerApplicability: string;
}

/** v2.5 (2G.1): an EXPLICIT stored model prefills the selects; a preset leaves them blank (so a preset is never re-sent as explicit). */
export function modelFormOf(m: CpmLoop['model']): ModelForm {
  const f = emptyModelForm();
  if (!m || m.classificationSource !== 'EXPLICIT') return f;
  const t = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return { ...f, serviceFamily: m.serviceFamily ?? '', dynamicClass: m.dynamicClass ?? '', objectiveType: m.objectiveType ?? '', topology: m.topology ?? '', commandPath: m.commandPath ?? '',
    acqMode: m.acquisition?.mode ?? '', gridSeconds: t(m.acquisition?.gridSeconds), sourceFilterS: t(m.acquisition?.sourceFilterS), tsQuantMs: t(m.acquisition?.timestampQuantizationMs), declaredScanS: t(m.acquisition?.declaredScanS) };
}

/** Blank stays blank: an undeclared bound must not round-trip as "0". */
const numText = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

/** The form for a new loop, or prefilled from the stored loop (activate is an upsert, so the same loopId updates it). */
export function initialForm(editLoop?: CpmLoop): WizardState {
  if (!editLoop) return {
    // site starts EMPTY: the old 'site1' placeholder was a site that exists in
    // no asset model, and activation now rejects unmodelled locations (G-07) —
    // a default that steers every new loop into a 422 is worse than forcing a
    // pick from the cascade.
    loopId: '', displayName: '', site: '', area: '', unit: '',
    loopType: 'FIC', criticality: 'medium',
    pv: '', sp: '', op: '', mode: '', vp: '',
    thresholdProfileId: '', enableMonitoring: true,
    pvMin: '', pvMax: '', opMin: '', opMax: '', pvUnit: '', vpApplicability: 'EXPECTED', peerApplicability: '',
    model: emptyModelForm(),
  };
  return {
    loopId: editLoop.loopId, displayName: editLoop.displayName, site: editLoop.site,
    area: editLoop.area ?? '', unit: editLoop.unit ?? '',
    loopType: editLoop.loopType, criticality: editLoop.criticality,
    pv: editLoop.tags['PV'] ?? '', sp: editLoop.tags['SP'] ?? '', op: editLoop.tags['OP'] ?? '',
    mode: editLoop.tags['MODE'] ?? '', vp: editLoop.tags['VP'] ?? '',
    thresholdProfileId: editLoop.thresholdProfileId ?? '', enableMonitoring: editLoop.monitoringEnabled,
    pvMin: numText(editLoop.engineering?.pvMin), pvMax: numText(editLoop.engineering?.pvMax),
    opMin: numText(editLoop.engineering?.opMin), opMax: numText(editLoop.engineering?.opMax),
    pvUnit: editLoop.engineering?.pvUnit ?? '',
    // CHG-077: the checkbox shows what the loop is today (declared, or derived from its command path)
    vpApplicability: vpApplicabilityOf(editLoop) === 'EXPECTED' ? 'EXPECTED' : 'NOT_APPLICABLE',
    peerApplicability: editLoop.engineering?.peerApplicability ?? '',
    model: modelFormOf(editLoop.model),
  };
}

/** Blank -> undefined (undeclared); unparseable -> null (a validation error). */
export function parseBound(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Only declared bounds are sent, so an omitted one stays omitted server-side. */
export function engineeringOf(f: { pvMin: string; pvMax: string; opMin: string; opMax: string; pvUnit: string } & OptionalInputForm) {
  const range: Record<string, number | string> = {};
  for (const k of ['pvMin', 'pvMax', 'opMin', 'opMax'] as const) {
    const v = parseBound(f[k]);
    if (typeof v === 'number') range[k] = v;
  }
  if (f.pvUnit.trim()) range.pvUnit = f.pvUnit.trim();
  Object.assign(range, applicabilityOf(f));
  return Object.keys(range).length > 0 ? range : null;
}

/**
 * Signal paths follow site/[area/]unit/<loopid>.<role>, so they are a pure
 * function of the location + loop tag. Re-derive any path the user has not
 * hand-edited (empty, or still equal to what the previous inputs derived) —
 * that is what stops five long paths being retyped per loop, and stops the
 * dotted IoTDB form being copied out of a placeholder. VP is opt-in: it is only
 * refreshed once it holds a value, since most loops have no position feedback.
 */
export function withDerivedPaths(prev: WizardState, next: WizardState): WizardState {
  const prevLoc: PlantLocation = { site: prev.site, area: prev.area, unit: prev.unit };
  const nextLoc: PlantLocation = { site: next.site, area: next.area, unit: next.unit };
  const out = { ...next };
  for (const role of SIGNAL_ROLES) {
    const current = (prev[role] ?? '').trim();
    if (role === 'vp' && current === '') continue;
    if (current === '' || current === deriveSignalPath(prevLoc, prev.loopId, role))
      out[role] = deriveSignalPath(nextLoc, next.loopId, role);
  }
  return out;
}

// ── CHG-098 (SME review 2 #28): validation that blocks Continue and says why ──

export interface FieldCheck { error: string | null; warning: string | null }

/**
 * One signal path. Only clear errors block: required-but-empty, whitespace or control characters inside, and the
 * shapes the binding resolver cannot split (the dotted root.… historian form, or fewer than two '/' segments — the
 * same rule the CSV bulk import already enforces). A stored path that is unchanged in an edit is never blocked: it
 * is what production runs today, so it only gets a warning.
 */
export function checkSignalPath(value: string, required: boolean, stored?: string): FieldCheck {
  const p = value.trim();
  if (p === '') return { error: required ? 'Required while monitoring is on' : null, warning: null };
  let problem: string | null = null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) problem = 'Contains a control character';
  else if (/\s/.test(p)) problem = 'Contains a space: UNS paths have no spaces';
  else if (!isResolvablePath(p))
    problem = 'Not a UNS contextual path. Use slashes (site/unit/loop.role), not the dotted root.… historian form, which the binding resolver cannot resolve';
  if (!problem) return { error: null, warning: null };
  if (stored !== undefined && p === stored.trim())
    return { error: null, warning: `${problem}. This is the stored path; it is kept as it is` };
  return { error: problem, warning: null };
}

const ROLE_REQUIRED: Record<SignalRole, boolean> = { pv: true, sp: true, op: true, mode: true, vp: false };

/** Per-role path checks for the signal step; `stored` holds the edit's original paths (undefined for a new loop). */
export function signalChecks(form: WizardState, stored?: WizardState): Record<SignalRole, FieldCheck> {
  const out = {} as Record<SignalRole, FieldCheck>;
  for (const role of SIGNAL_ROLES)
    out[role] = checkSignalPath(form[role], form.enableMonitoring && ROLE_REQUIRED[role], stored?.[role]);
  return out;
}

type RangeKey = 'pvMin' | 'pvMax' | 'opMin' | 'opMax';

/** Range problems, keyed by the field the message sits next to. */
export function rangeChecks(form: WizardState): Partial<Record<RangeKey | 'pvUnit', string>> {
  const out: Partial<Record<RangeKey | 'pvUnit', string>> = {};
  for (const k of ['pvMin', 'pvMax', 'opMin', 'opMax'] as const)
    if (parseBound(form[k]) === null) out[k] = 'Must be a number';
  for (const [lo, hi, label] of [['pvMin', 'pvMax', 'PV'], ['opMin', 'opMax', 'OP']] as const) {
    if (out[lo] || out[hi]) continue;
    const a = parseBound(form[lo]), b = parseBound(form[hi]);
    // Half a range is worse than none: the API defaults the missing bound (0 / 100), inventing a span nobody declared.
    if ((a === undefined) !== (b === undefined))
      out[a === undefined ? lo : hi] = `${label} range is half-declared: give both bounds or neither`;
    else if (typeof a === 'number' && typeof b === 'number' && a >= b)
      out[hi] = `${label} maximum must be greater than the minimum`;
  }
  if (form.pvUnit.trim() && !isValidPvUnit(form.pvUnit))
    out.pvUnit = 'Letters, digits, spaces and ° % / . - · ² ³ µ ( ) ^ * only';
  return out;
}

/** The first problem on a step, as the sentence shown beside the disabled Continue button. */
export function firstProblem(checks: Record<string, string | null | undefined>, labels: Record<string, string>): string | null {
  for (const [k, v] of Object.entries(checks)) if (v) return `${labels[k] ?? k}: ${v}`;
  return null;
}
