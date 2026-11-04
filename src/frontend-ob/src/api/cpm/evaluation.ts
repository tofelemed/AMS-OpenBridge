/**
 * CHG-102 Phase 5c: on-demand evaluation of one loop over one window, read from the historian by the always-running
 * Flink on-demand job (POST /analysis-runs {purpose: EVALUATE}). The run ends FINISHED with the window's method run ids
 * (verdictMethodRunId = the fused G15 run the workbench opens) or FAILED with a reason. A finished run of the same window
 * whose evidence is still held (3 days) comes back at once (`cached`).
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export type EvaluationKind = '4h' | '12h' | '24h';
export const EVALUATION_KINDS: readonly EvaluationKind[] = ['4h', '12h', '24h'];
export const EVALUATION_KIND_MS: Record<EvaluationKind, number> = { '4h': 4 * 3_600_000, '12h': 12 * 3_600_000, '24h': 24 * 3_600_000 };

export type EvaluationState = 'QUEUED' | 'RUNNING' | 'FINISHED' | 'FAILED';

export interface EvaluationRun {
  analysisRunId: string;
  loopId: string;
  purpose: 'EVALUATE';
  state: EvaluationState;
  finished?: boolean;
  succeeded?: boolean;
  cached: boolean;
  windowKind: EvaluationKind;
  fromMs: number;
  toMs: number;
  error?: string | null;
  methodRunIds?: Record<string, string>;
  verdictMethodRunId?: string | null;
  evidenceUrl?: string | null;
  samples?: number | null;
  artifacts?: number | null;
  elapsedMs?: number | null;
  finishedAt?: string | null;
  /** Gate-result rows the run has written: the job's status, result and evidence travel on three topics, so FINISHED can
   *  arrive before the verdict row is stored - the workbench opens the run once this is above 0. */
  gateResults?: number;
  evidenceManifests?: number;
  evidenceComplete?: number;
  statusUrl: string;
}

export const postEvaluation = (loopId: string, windowKind: EvaluationKind, endMs: number) =>
  apiJson<EvaluationRun>(`${CPM_BASE}/analysis-runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose: 'EVALUATE', loopId, windowKind, endMs }),
  });

export const getEvaluation = (analysisRunId: string, signal?: AbortSignal) =>
  apiJson<EvaluationRun>(`${CPM_BASE}/analysis-runs/${encodeURIComponent(analysisRunId)}`, { signal });

/** The API's window end: on the 15-min grid the engine evaluates on (rounded down). */
export const floorTo15Min = (ms: number) => Math.floor(ms / 900_000) * 900_000;
