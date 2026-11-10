/**
 * What each loop signal is, in plain words, for the Signals tab (CHG-158, the owner's design): the role's name, and one
 * sentence on what it carries for this loop. The measured quantity comes from the loop type (FIC flow, LIC level, PIC
 * pressure, TIC temperature, AIC analyser reading), else from the tag's first letter.
 */
import type { CpmLoop } from '../../../api/cpmApi';

const NAMES: Record<string, string> = {
  PV: 'Process variable',
  SP: 'Setpoint',
  OP: 'Controller output',
  MODE: 'Controller mode',
  VP: 'Valve position feedback',
  QUALITY: 'Source quality',
  UPSTREAM: 'Upstream context signal',
  STATUS: 'Status signal',
  UTILITY: 'Utility signal',
};

const QUANTITY: Record<string, string> = { F: 'flow', L: 'level', P: 'pressure', T: 'temperature', A: 'analyser reading' };

/** The measured quantity of a loop, or "value" when its type says nothing. */
export function quantityOf(loop: Pick<CpmLoop, 'loopId' | 'loopType'>): string {
  const type = (loop.loopType ?? '').toUpperCase();
  const letter = type && type !== 'UNKNOWN' ? type[0] : loop.loopId.trim().toUpperCase()[0];
  return QUANTITY[letter ?? ''] ?? 'value';
}

export const signalName = (role: string): string => NAMES[role] ?? role;

export function signalDescription(role: string, loop: Pick<CpmLoop, 'loopId' | 'loopType'>): string {
  const q = quantityOf(loop);
  switch (role) {
    case 'PV': return `The ${q} currently measured on this loop.`;
    case 'SP': return `The ${q} the controller is trying to reach.`;
    case 'OP': return 'How far the controller is driving the valve open.';
    case 'MODE': return 'Whether the loop runs automatically, manually or in cascade.';
    case 'VP': return 'Where the valve actually is, as its positioner reports it.';
    case 'QUALITY': return 'The quality the source reports for this loop’s signals.';
    case 'UPSTREAM': return 'A signal upstream of this loop, read as context.';
    case 'STATUS': return 'A status the controller reports.';
    case 'UTILITY': return 'A utility signal that serves this loop.';
    default: return '';
  }
}
