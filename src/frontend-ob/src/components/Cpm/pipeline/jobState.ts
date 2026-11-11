/**
 * CHG-170 (owner review, Pipeline Health): a job's state as tone + glyph + word, its role as a word, and the list's groups.
 * RUNNING reads ✓ Running; a required job the engine does not list ✕ Missing; the transitional states (the engine is bringing
 * the job up) ◐ Starting in amber rather than red; a stopped job its state in words.
 */
import type { CpmTone } from '../shared';
import type { CpmJobRole } from '../../../api/cpmApi';
import type { JobRow } from './mergeJobs';

export interface StateView { tone: CpmTone; glyph: string; word: string }

/** The engine is bringing the job up: not a failure yet. */
const STARTING = new Set(['INITIALIZING', 'CREATED', 'RESTARTING', 'RECONCILING']);

const STOPPED: Record<string, string> = {
  FAILED: 'Failed', FAILING: 'Failing', CANCELED: 'Cancelled', CANCELLING: 'Cancelling', FINISHED: 'Finished', SUSPENDED: 'Suspended',
};

const words = (code: string) => {
  const s = code.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const isStarting = (state: string) => STARTING.has(state);

export function stateView(state: string): StateView {
  if (state === 'RUNNING') return { tone: 'good', glyph: '✓', word: 'Running' };
  if (STARTING.has(state)) return { tone: 'warn', glyph: '◐', word: 'Starting' };
  if (state === 'MISSING') return { tone: 'bad', glyph: '✕', word: 'Missing' };
  return { tone: 'bad', glyph: '✕', word: STOPPED[state] ?? words(state) };
}

/** The heading of the jobs the required list does not name. */
export const OTHER_GROUP = 'Not on the required list';

const ROLE_ORDER: CpmJobRole[] = ['alarm', 'cplm', 'platform'];
const ROLE_WORD: Record<CpmJobRole, string> = { alarm: 'Alarm', cplm: 'CPLM', platform: 'Platform' };

export const roleWord = (role: CpmJobRole | null): string => (role == null ? OTHER_GROUP : ROLE_WORD[role] ?? words(role));

/** The engine's job name without the shared "AMS - " prefix. */
export const jobLabel = (name: string) => name.replace(/^AMS[ -]+/, '');

/** Alarm, CPLM, Platform (the supervisor's order inside each), then the jobs off the required list; empty groups left out. */
export function groupRows(rows: JobRow[]): Array<{ title: string; rows: JobRow[] }> {
  const roles = [...ROLE_ORDER, ...new Set(rows.map(r => r.role).filter((r): r is CpmJobRole => r != null && !ROLE_ORDER.includes(r)))];
  const groups = roles.map(role => ({ title: roleWord(role), rows: rows.filter(r => r.required && r.role === role) }));
  groups.push({ title: OTHER_GROUP, rows: rows.filter(r => !r.required || r.role == null) });
  return groups.filter(g => g.rows.length > 0);
}
