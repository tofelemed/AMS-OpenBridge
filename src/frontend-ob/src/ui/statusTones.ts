/**
 * CD8: which tone each field's value takes. Fields stay separate: a badge in one never sets another
 * (guide p.4). Values are matched case-insensitively. An unrecognised value is `unknown`, because a
 * state this code cannot name must never look healthy. Gates are not here: they use GateBadge, which
 * reads the one gate vocabulary in components/Cpm/gateStatus.ts.
 */
export type BadgeTone = 'danger' | 'warning' | 'success' | 'info' | 'unknown' | 'neutral';

export interface ToneResult {
  tone: BadgeTone;
  glyph?: string;
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

const UNKNOWN: ToneResult = { tone: 'unknown' };

export function diagnosisTone(value: string | null | undefined): ToneResult {
  const v = norm(value);
  if (v.startsWith('CONFIRMED')) return { tone: 'warning' }; // condition open; pending control engineering (CD8)
  if (v.startsWith('SUSPECTED') || v.startsWith('DETECTED') || v.startsWith('CLASSIFIED')) return { tone: 'info' };
  if (v.startsWith('RULED_OUT') || v === 'NO_FAULT' || v === 'NONE_FOUND') return { tone: 'neutral' };
  return UNKNOWN;
}

export function episodeTone(value: string | null | undefined): ToneResult {
  const v = norm(value);
  if (v === 'UNACKNOWLEDGED' || v === 'OPEN' || v === 'SHELF_EXPIRED' || v === 'EXPIRED') return { tone: 'warning' };
  if (v === 'ACKNOWLEDGED') return { tone: 'info' };
  if (v === 'SHELVED') return { tone: 'neutral' };
  return UNKNOWN;
}

export function qualityTone(value: string | null | undefined, aged = false): ToneResult {
  const v = norm(value);
  if (v === 'GOOD') return aged ? { tone: 'warning' } : { tone: 'neutral' };
  if (v === 'UNCERTAIN' || v === 'MAINT' || v === 'MAINTENANCE') return { tone: 'warning' };
  if (v === 'BAD') return { tone: 'danger' };
  return UNKNOWN; // OOS, no comm
}

export function jobTone(value: string | null | undefined): ToneResult {
  const v = norm(value);
  if (v === 'RUNNING' || v === 'IN_PROGRESS') return { tone: 'info' };
  if (v === 'COMPLETED' || v === 'DONE' || v === 'ACTIVE_VERIFIED' || v === 'COMPLETE' || v === 'VALIDATED') return { tone: 'success' };
  if (v === 'FAILED' || v === 'REJECTED' || v === 'JOB_DOWN' || v === 'DOWN') return { tone: 'danger' };
  return UNKNOWN; // queued
}

export function registryTone(value: string | null | undefined): ToneResult {
  const v = norm(value);
  if (v === 'ACTIVE' || v === 'CONNECTED') return { tone: 'info' };
  if (v === 'DEGRADED') return { tone: 'warning' };
  return UNKNOWN;
}

/** Priority, criticality, severity, change class and roles carry no status colour (guide p.4). */
export const NEUTRAL: ToneResult = { tone: 'neutral' };
