/**
 * UI-037 (2): registry text is verbatim, so entries carry placeholders such as `{NormalModeMin:P0}`.
 * Toggletip's `values` fills them, and leaves as written any token it is not given, so this list has
 * to name every token the page shows. Set notation in a formula (`{NO_CALL, INSUFFICIENT_EVIDENCE}`)
 * is part of the formula and is not a token.
 */
import type { FleetKpiBasis } from '../../../api/cpm/fleetKpis';
import { gateName } from '../../../components/Cpm/gateStatus';

const percent = (v: number | undefined) => (v == null ? 'the configured limit' : `${Math.round(v * 100)} %`);
const gateResult = (code: string) => `${gateName(code)} · ${code} result`;

export function helpValues(b: FleetKpiBasis | undefined, extra: Record<string, string> = {}): Record<string, string> {
  const minutes = b ? String(Math.round(b.freshSeconds / 60)) : 'the configured';
  const kind = b?.windowKind ?? 'evaluated';
  return {
    'NormalModeMin:P0': percent(b?.normalModeMin),
    '1 - NormalModeMin:P0': percent(b ? 1 - b.normalModeMin : undefined),
    'SaturationMax:P0': percent(b?.saturationMax),
    'ManualModeMin:P0': percent(b?.manualModeMin),
    'G0CompletenessMin:P0': percent(b?.g0CompletenessMin),
    WindowKind: kind,
    'FreshSeconds/60': minutes,
    fresh: `newest ${kind} result ≤ ${minutes} min old`,
    // Loop-level tokens, read in a fleet column where no one loop applies.
    'G1 status': gateResult('G1'),
    'G3 status': gateResult('G3'),
    'G4 status': gateResult('G4'),
    mae: 'MAE',
    unit: 'in PV units',
    basis: 'registered OP range, or 0–100 % where none is registered',
    ...extra,
  };
}

/** Gate references read name first: "Base performance · G3" (CD18). */
export const nameGates = (text: string): string =>
  text.replace(/\bG\d+r?\b/g, code => (gateName(code) === code ? code : `${gateName(code)} · ${code}`));
