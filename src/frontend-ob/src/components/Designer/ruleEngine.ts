// Phase F — conditional-formatting rule engine + multi-state evaluator.
// Pure functions: given a symbol's rules/multistate config and a slot-value accessor,
// compute the visual outcome (color / blink / hidden / rotate / label). No React here.
import type { VisualRule, RuleOperator, MultiStateConfig } from './types';

export interface RuleOutcome {
  hidden: boolean;
  blink: boolean;
  color?: string;
  rotateDeg?: number;
}

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

function compare(op: RuleOperator, v: unknown, a: number | string | boolean, b?: number): boolean {
  const n = toNum(v);
  const t = toNum(a);
  switch (op) {
    case '>':  return n > t;
    case '>=': return n >= t;
    case '<':  return n < t;
    case '<=': return n <= t;
    case '==': return v === a || (!Number.isNaN(n) && !Number.isNaN(t) && n === t) || String(v) === String(a);
    case '!=': return !(v === a || String(v) === String(a) || (!Number.isNaN(n) && n === t));
    case 'between': return b !== undefined && n >= t && n <= b;
    case 'outside': return b !== undefined && (n < t || n > b);
    default: return false;
  }
}

/** Evaluate all rules in order; later matching rules win per-effect. */
export function evaluateRules(
  rules: VisualRule[] | undefined,
  getSlot: (slot?: string) => unknown,
): RuleOutcome {
  const out: RuleOutcome = { hidden: false, blink: false };
  if (!rules?.length) return out;
  for (const r of rules) {
    const v = getSlot(r.slot);
    if (v === undefined || v === null) continue;
    if (!compare(r.op, v, r.value, r.value2)) continue;
    switch (r.effect) {
      case 'color':  if (r.color) out.color = r.color; break;
      case 'blink':  out.blink = true; break;
      case 'hidden': out.hidden = true; break;
      case 'rotate': if (r.rotateDeg !== undefined) out.rotateDeg = r.rotateDeg; break;
    }
  }
  return out;
}

export interface MultiStateOutcome { color?: string; label?: string; blink?: boolean; }

/** Resolve a value to a multi-state entry (first matching range/equals wins), else default. */
export function evaluateMultiState(
  cfg: MultiStateConfig | undefined,
  getSlot: (slot?: string) => unknown,
): MultiStateOutcome | null {
  if (!cfg?.states?.length) return null;
  const v = getSlot(cfg.slot);
  for (const s of cfg.states) {
    if (s.equals !== undefined) {
      if (v === s.equals || String(v) === String(s.equals)) return { color: s.color, label: s.label, blink: s.blink };
      continue;
    }
    const n = toNum(v);
    if (Number.isNaN(n)) continue;
    const okMin = s.min === undefined || n >= s.min;
    const okMax = s.max === undefined || n <= s.max;
    if (okMin && okMax) return { color: s.color, label: s.label, blink: s.blink };
  }
  return cfg.default ? { color: cfg.default.color, label: cfg.default.label } : null;
}
