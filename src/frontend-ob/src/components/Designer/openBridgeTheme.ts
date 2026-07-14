/**
 * OpenBridge / ISA-101 design tokens for custom HMI symbols.
 * Custom SVG components use the same CSS variables as @oicl/openbridge-webcomponents.
 */
export const OBC = {
  // Surfaces
  bg: 'var(--container-background-color, #1f1f1f)',
  section: 'var(--container-section-color, #262626)',
  backdrop: 'var(--container-backdrop-color, #0f0f0f)',

  // Text / elements (grayscale – normal state)
  textActive: 'var(--element-active-color, #f1f5f9)',
  textNeutral: 'var(--element-neutral-color, #949494)',
  textInactive: 'var(--element-inactive-color, #757575)',
  textDisabled: 'var(--element-disabled-color, #535353)',

  // Borders
  border: 'var(--normal-enabled-border-color, #bebebe)',
  borderFocus: 'var(--normal-focused-border-color, #4271b3)',

  // ISA-101: color reserved for abnormal / priority states only.
  // Phase H — single token source (designTokens.css); drives alarms (F) AND trend pens (C).
  alarm: 'var(--ams-crit)',
  warning: 'var(--ams-warn)',
  caution: 'var(--ams-caut)',
  running: 'var(--ams-run)',
  advisory: 'var(--ams-advisory)',

  // Alarm container backgrounds (subtle fills)
  alarmBg: 'var(--alert-alarm-container-background-color, rgba(255,210,203,0.15))',
  warningBg: 'var(--alert-warning-container-background-color, rgba(255,212,175,0.15))',
  cautionBg: 'var(--alert-caution-container-background-color, rgba(255,240,136,0.15))',
  runningBg: 'var(--alert-running-container-background-color, rgba(194,229,191,0.15))',
} as const;

export type NamurState = 'failure' | 'check' | 'maintenance' | 'good' | 'unknown';

export function getNamurState(value: unknown): NamurState {
  if (value === undefined || value === null) return 'unknown';
  if (typeof value === 'number') {
    if (value === 0) return 'good';
    if (value === 1) return 'check';
    if (value === 2) return 'maintenance';
    if (value >= 3) return 'failure';
    return 'unknown';
  }
  const s = String(value).toLowerCase();
  if (s === 'good' || s === 'ok' || s === 'normal') return 'good';
  if (s === 'check' || s === 'warning' || s === 'caution') return 'check';
  if (s === 'maintenance' || s === 'maint') return 'maintenance';
  if (s === 'failure' || s === 'bad' || s === 'alarm' || s === 'fault') return 'failure';
  return 'unknown';
}

export function getValueColor(
  value: number,
  limits?: { hiHi?: number; hi?: number; lo?: number; loLo?: number }
): string {
  if (!limits) return OBC.textActive;
  if (limits.hiHi !== undefined && value >= limits.hiHi) return OBC.alarm;
  if (limits.loLo !== undefined && value <= limits.loLo) return OBC.alarm;
  if (limits.hi !== undefined && value >= limits.hi) return OBC.warning;
  if (limits.lo !== undefined && value <= limits.lo) return OBC.caution;
  return OBC.textActive;
}

/**
 * NE107 / data-quality: a live sample is STALE if it hasn't updated within
 * thresholdMs. Sim/edge publish every ~2s; 8s with no update ⇒ stale.
 */
export function isStale(ts?: number, thresholdMs = 8000): boolean {
  if (ts === undefined || ts === null || !Number.isFinite(ts)) return false;
  return Date.now() - ts > thresholdMs;
}

/** Sparkplug B quality: 192 = GOOD. Anything else is uncertain/bad. */
export function isBadQuality(quality?: number): boolean {
  return quality !== undefined && quality !== 192;
}

export function getPercentage(value: number, min = 0, max = 100): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function formatValue(value: unknown, decimals = 1, unit?: string): string {
  if (value === undefined || value === null) return '--';
  if (typeof value === 'number') {
    const f = value.toFixed(decimals);
    return unit ? `${f} ${unit}` : f;
  }
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  return String(value);
}
