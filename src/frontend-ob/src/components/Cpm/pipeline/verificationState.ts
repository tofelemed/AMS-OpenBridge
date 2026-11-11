/**
 * CHG-170 (owner review, Pipeline Health): the end-to-end verification's state, said once in its head as tone + glyph + word.
 * Owner answer 3a: Verified only when the run actually wrote results - the replay status carries `gateResults` (the rows the
 * run wrote); a finished run that wrote none reads Not verified, and the Results row says why. The engine's codes (VERIFIED,
 * FAILED (state), STATE UNKNOWN) are words now.
 */
import type { StateView } from './jobState';

export interface ReplayState {
  replayId: string;
  jobId: string;
  state: string;
  finished: boolean;
  succeeded: boolean;
  /** The result rows the run wrote (CplmRecomputeService); absent on an answer that does not carry it. */
  gateResults?: number;
}

const wrote = (s: ReplayState) => (s.gateResults ?? 0) > 0;

/** The run finished, succeeded and wrote at least one result. */
export const isVerified = (s: ReplayState | null | undefined) => !!s && s.finished && s.succeeded && wrote(s);

export function verificationHead({ started, pending, status }: {
  /** A run was submitted and has not been cleared. */
  started: boolean;
  /** The start request is on its way. */
  pending: boolean;
  status: ReplayState | null | undefined;
}): StateView {
  if (pending) return { tone: 'warn', glyph: '◐', word: 'Running' };
  if (!started && !status) return { tone: 'muted', glyph: '○', word: 'Not run' };
  if (!status) return { tone: 'warn', glyph: '?', word: 'Unknown' };
  if (!status.finished) return { tone: 'warn', glyph: '◐', word: 'Running' };
  if (isVerified(status)) return { tone: 'good', glyph: '✓', word: 'Verified' };
  if (status.state === 'FAILED') return { tone: 'bad', glyph: '✕', word: 'Failed' };
  if (status.state === 'CANCELED') return { tone: 'bad', glyph: '✕', word: 'Cancelled' };
  return { tone: 'bad', glyph: '✕', word: 'Not verified' };
}

/** The Results row of a finished run: how many results it wrote, or why it is not verified. Null while it runs. */
export function resultsText(s: ReplayState | null | undefined): string | null {
  if (!s?.finished) return null;
  if (s.gateResults == null) return 'Not reported by the analysis service';
  if (s.gateResults === 0) return 'None written: no verdict reached the database';
  return `${s.gateResults} written`;
}
