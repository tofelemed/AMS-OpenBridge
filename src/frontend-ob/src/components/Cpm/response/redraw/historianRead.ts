/**
 * CHG-198 (owner, approved 2026-11-15): what "Redraw from historian" reads. GET only, the existing raw read the Evidence Replay
 * pages with (/api/hist/raw/cursor), for the loop's series over the engine's support of the event: its pre-event support before
 * the step through the event end, PV, SP and the input the engine fitted against (OP; VP on a VP path), paged until the
 * historian says it is done. Nothing is written and no new request exists for it.
 */
import { getRawCursor } from '../../../../api/cpmApi';
import { ApiError } from '../../../../api/apiFetch';
import type { CpmTrendPoint } from '../../../../api/cpm/kpis';
import type { ResponseEventDetail } from '../../../../api/cpm/response';

/**
 * How long the historian keeps loop samples. No setting or API serves it to the page: prod_decision.md, "Loop historian
 * namespace" row: database root.hdpe.cpm, TTL 90 d. Change both together.
 */
export const HISTORIAN_KEEP_DAYS = 90;

/**
 * The engine's pre-event support (s): the samples before the step it keeps with an event, for the baseline median. The event
 * and its quantities do not carry it (every quantity's support is the step to the event end), so the engine's own default is
 * used: G12.pre_support_s = 120 in cplm-api Config/factory-layer.json, ResponseJobConfig.preSupportS in the Flink job (the 60 s
 * in ResponseMetricCalculator.Settings is overwritten by the job's value).
 */
export const PRE_SUPPORT_S = 120;

/** Rows per page: below the historian's row limit per query, as Evidence Replay reads. */
export const REDRAW_PAGE = 9_000;

export interface RedrawWindow {
  /** The step and the event end, epoch ms (the event's window_start_ms / window_end_ms). */
  t0Ms: number;
  tEndMs: number;
  /** What the historian is asked for: from the pre-event support, to just past the event end (its end is exclusive). */
  fromMs: number;
  toMs: number;
  /** The engine's input: VP on a VP path (ResponseCapture: vpMapped ? vp : op), OP on every other path. */
  input: 'op' | 'vp';
  measurements: string;
}

export function redrawWindow(result: ResponseEventDetail['result'] | undefined, t0Ms: number): RedrawWindow | null {
  if (!result) return null;
  const start = Number(result.window_start_ms);
  const t0 = Number.isFinite(start) && start > 0 ? start : t0Ms;
  const tEnd = Number(result.window_end_ms);
  if (!Number.isFinite(t0) || t0 <= 0 || !Number.isFinite(tEnd) || tEnd <= t0) return null;
  const input = String(result.path_id ?? '').toUpperCase() === 'VP_TO_PV' ? 'vp' : 'op';
  return { t0Ms: t0, tEndMs: tEnd, fromMs: t0 - PRE_SUPPORT_S * 1000, toMs: tEnd + 1, input, measurements: `pv,sp,${input}` };
}

/** True once the first sample the redraw needs is older than the historian keeps loop samples. */
export const pastHistorianKeep = (w: RedrawWindow, nowMs: number): boolean => w.fromMs < nowMs - HISTORIAN_KEEP_DAYS * 86_400_000;

/** Every page of the window, in time order; `onProgress` hears the points read so far after each page. */
export async function readHistorian(series: string, w: RedrawWindow, signal: AbortSignal, onProgress: (points: number) => void): Promise<CpmTrendPoint[]> {
  const points: CpmTrendPoint[] = [];
  let cursor: number | undefined;
  for (;;) {
    const page = await getRawCursor(series, new Date(w.fromMs), new Date(w.toMs), REDRAW_PAGE, cursor, w.measurements, signal);
    for (const p of page.points) points.push(p);
    onProgress(points.length);
    // a cursor that does not move on would read the same page for ever
    if (!page.hasMore || page.nextCursor == null || (cursor != null && page.nextCursor <= cursor)) break;
    cursor = page.nextCursor;
  }
  return points;
}

/** A failed read in plain words. */
export function readFailure(e: unknown): string {
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return 'You are not allowed to read this loop\'s history.';
  return 'The historian did not answer. Try again in a minute.';
}
