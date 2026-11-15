/**
 * CHG-201 (owner, 15 Nov 2026: "proper labels, simple text, not backend related text or IDs"): the one place the Loop Registry
 * list, the Loop detail page and the loop editor turn the registry's codes into words, so the page and the editor say the same
 * thing. A code with no word here is humanised (vocabulary.humanise), never shown as stored.
 */
import { humanise } from '../vocabulary';

const LOOP_TYPE: Record<string, string> = {
  FIC: 'Flow', PIC: 'Pressure', PIC_GAS: 'Gas pressure', PIC_VAPOUR: 'Vapour pressure', LIC: 'Level', TIC: 'Temperature',
};

/** The loop type as the kind of loop ("FIC" → "Flow"). CHG-200: a loop with no type reads "Unknown type". */
export function loopTypeWord(type: string | null | undefined): string {
  const t = (type ?? '').trim().toUpperCase();
  if (!t || t === 'UNKNOWN') return 'Unknown type';
  return LOOP_TYPE[t] ?? 'Other';
}

export type ModelDim = 'serviceFamily' | 'dynamicClass' | 'objectiveType' | 'topology' | 'commandPath';

/** The five model dimensions, by the names the detail page and the editor give them. */
export const MODEL_FIELDS: Record<ModelDim, string> = {
  serviceFamily: 'Service',
  dynamicClass: 'Process behaviour',
  objectiveType: 'Control goal',
  topology: 'Control structure',
  commandPath: 'Final element',
};

const MODEL: Record<ModelDim, Record<string, string>> = {
  serviceFamily: {
    FLOW: 'Flow', PRESSURE_LIQUID: 'Liquid pressure', PRESSURE_GAS: 'Gas pressure', PRESSURE_VAPOUR: 'Vapour pressure',
    LEVEL: 'Level', TEMPERATURE: 'Temperature', COMPOSITION_ANALYZER: 'Composition (analyser)', PH_CONDUCTIVITY: 'pH or conductivity',
    SPEED_POSITION_POWER: 'Speed, position or power', CASCADE: 'Cascade', SPLIT_RANGE_OVERRIDE_RATIO: 'Split range, override or ratio',
    UNKNOWN_UNSTABLE_INVERSE_MIMO: 'Other',
  },
  dynamicClass: {
    FAST_SELF_REG: 'Fast, settles on its own', SLOW_SELF_REG: 'Slow, settles on its own',
    INTEGRATING: 'Keeps rising or falling until corrected', INTEGRATING_LAG: 'Keeps rising or falling, after a delay',
    UNDERDAMPED: 'Overshoots before it settles', UNKNOWN: 'Not known',
  },
  objectiveType: {
    TIGHT: 'Tight control', AVERAGING: 'Averaging (smooth changes)', RATIO: 'Keep a ratio', CONSTRAINT: 'Stay within a limit',
    RAMP: 'Follow a ramp', BATCH: 'Batch', QUALITY: 'Product quality', SUPERVISORY: 'Sets other loops', UNSET: 'Not set',
  },
  topology: {
    SINGLE: 'Single loop', CASCADE_MASTER: 'Cascade master (outer loop)', CASCADE_SLAVE: 'Cascade slave (inner loop)',
    SPLIT_RANGE: 'Split range', OVERRIDE: 'Override', RATIO: 'Ratio', FEEDFORWARD: 'Feedforward', UNKNOWN: 'Not known',
  },
  commandPath: {
    OP_TO_VALVE: 'Control valve', OP_TO_VFD: 'Variable-speed drive', OP_TO_SLAVE_SP: 'Setpoint of another loop',
    OP_TO_PV: 'Acts on the process directly', UNKNOWN: 'Not known',
  },
};

/** A model dimension's value in words; a value with no word is humanised; none reads "Not set". */
export function modelWord(dim: ModelDim, code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return 'Not set';
  return MODEL[dim][c] ?? humanise(c);
}

const ACQUISITION: Record<string, string> = {
  PERIODIC: 'At regular intervals', RBE: 'When the value changes', SAMPLE_HOLD: 'Sampled, held between samples',
};

/** How the samples arrive; the registry's default is at regular intervals. */
export function acquisitionWord(mode: string | null | undefined): string {
  const m = (mode ?? '').trim().toUpperCase();
  return m ? ACQUISITION[m] ?? humanise(m) : ACQUISITION.PERIODIC;
}

/** Where the loop's classification came from: the loop type's preset, or a person. */
export function classificationNote(source: string | null | undefined): string {
  return (source ?? '').toUpperCase() === 'EXPLICIT' ? 'Set by a person.' : 'Set from the loop type. Change it in Edit loop.';
}

export const criticalityWord = (c: string | null | undefined): string => humanise(c) || 'Not set';

/** The assessment settings: "Standard" for the default profile, else the name a person gave it. */
export function profileWord(id: string | null | undefined): string {
  const name = (id ?? '').trim();
  return !name || name.toLowerCase() === 'default' ? 'Standard' : name;
}

const RELATION: Record<string, string> = {
  CASCADE_PRIMARY: 'Cascade master of', CASCADE_SECONDARY: 'Cascade slave of',
  UPSTREAM_OF: 'Upstream of', DOWNSTREAM_OF: 'Downstream of', PEER: 'Interacts with',
};

/** How this loop relates to a linked one ("Cascade master of"). */
export const relationWord = (relType: string): string => RELATION[(relType ?? '').toUpperCase()] ?? 'Linked to';

/** A link said from this loop's side ("Cascade master of FIC10402"). */
export const relationText = (relType: string, other: string): string => `${relationWord(relType)} ${other}`;
