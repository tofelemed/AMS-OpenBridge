/**
 * CHG-198 (owner, approved 2026-11-15): the historian's samples as the arrays the CHG-197 trends read (trends/responseFacts), so
 * the same trend builders draw the event again; nothing here derives a value the trends print. Kinds as the engine stores them
 * (ResponseEvidenceWriter): accepted_samples (PV), input_reconstruction (the input), response_event (the step and the event
 * end), target (the held setpoint, a setpoint step only); plus historian_sp, the setpoint of every sample, which the stored
 * arrays never carry. The historian does not know which samples the engine left out (bad quality, not in Auto), so every sample
 * with a PV is drawn; a mark that needs the engine's own number is then drawn only when these samples reproduce it.
 */
import type { CpmTrendPoint } from '../../../../api/cpm/kpis';
import type { EvidenceArtifactMeta } from '../../../../api/cpm/evidence';
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import type { DecodedArtifact } from '../../evidence/artifactCodec';
import { metricOf } from '../responseSupport';
import { buildFacts } from '../trends/responseFacts';
import { responseTrendSpecs } from '../trends/responseTrendSpecs';
import { ERROR_TREND_TITLE } from '../trends/errorTrend';
import type { RedrawWindow } from './historianRead';

export type RedrawnArtifacts = Record<string, DecodedArtifact[]>;

interface Columns { t: number[]; pv: number[]; sp: number[]; u: number[] }

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

function artifact(kind: string, pathId: string, x: number[], y: number[], yQuantity: string, yUnit: string, mask?: boolean[]): DecodedArtifact {
  const columns = { x: Float64Array.from(x), y: Float64Array.from(y) };
  const meta: EvidenceArtifactMeta = {
    artifactId: `historian-${kind}`, methodRunId: '', gate: 'G12', kind, roleOrPath: pathId || null,
    x: { quantity: 'time', unit: 's' }, y: { quantity: yQuantity, unit: yUnit }, dataType: 'f64', columns: ['x', 'y'], encoding: 'historian',
    calculationSamples: x.length, displayPoints: x.length, chunkCount: 0, totalBytes: 0, checksum: '', chunkChecksums: [], chunksUrl: '',
    readiness: 'COMPLETE', readinessReason: null, provenance: { source: 'historian' }, retentionClass: 'NONE', pinned: false, createdAt: '', completedAt: null,
  };
  return { meta, n: x.length, columns, mask: mask ?? null, units: { x: 's', y: yUnit }, legends: {} };
}

/**
 * The setpoint the engine held after a setpoint step (ResponseCapture.close: r0 = the setpoint of the last valid sample before the
 * step, r1 = that of the last valid sample), returned only when r1 − r0 gives the engine's sp_step (within the precision the
 * historian stores a value at); never on another event, where the engine draws no setpoint.
 */
function heldSetpoint(c: Columns, t0: number, spStep: number | null): number | null {
  if (spStep == null) return null;
  let r0 = NaN, r1 = NaN;
  for (let i = 0; i < c.t.length; i++) {
    if (!Number.isFinite(c.pv[i]) || !Number.isFinite(c.sp[i])) continue;
    if (c.t[i] < t0) r0 = c.sp[i];
    r1 = c.sp[i];
  }
  if (!Number.isFinite(r0) || !Number.isFinite(r1)) return null;
  return Math.abs(r1 - r0 - spStep) <= 1e-6 * Math.max(1, Math.abs(r0), Math.abs(r1)) ? r1 : null;
}

function assemble(c: Columns, w: RedrawWindow, pathId: string, metrics: ResponseQuantity[] | undefined): RedrawnArtifacts {
  const t0 = w.t0Ms / 1000, tEnd = w.tEndMs / 1000;
  const byKind: RedrawnArtifacts = {
    response_event: [artifact('response_event', pathId, [t0, tEnd], [0, 1], 'marker', 'index')],
    accepted_samples: [artifact('accepted_samples', pathId, c.t, c.pv, 'pv', 'PV_EU', c.pv.map(Number.isFinite))],
    input_reconstruction: [artifact('input_reconstruction', pathId, c.t, c.u, 'u_applied', 'input_EU')],
    historian_sp: [artifact('historian_sp', pathId, c.t, c.sp, 'sp', 'PV_EU')],
  };
  const r1 = heldSetpoint(c, t0, metricOf(metrics, 'sp_step')?.value ?? null);
  if (r1 != null) byKind.target = [artifact('target', pathId, [t0, tEnd], [r1, r1], 'reference', 'PV_EU')];
  return byKind;
}

/** The arrays of a redraw, or null when the historian holds no PV sample in the window (nothing to draw). */
export function redrawArtifacts(points: CpmTrendPoint[], w: RedrawWindow, pathId: string, metrics: ResponseQuantity[] | undefined): RedrawnArtifacts | null {
  const c: Columns = { t: [], pv: [], sp: [], u: [] };
  for (const p of points) {
    const ts = num(p.ts);
    if (!Number.isFinite(ts) || ts < w.fromMs || ts > w.tEndMs) continue;
    // strictly increasing, as the engine's closer keeps its samples
    if (c.t.length > 0 && ts / 1000 <= c.t[c.t.length - 1]) continue;
    c.t.push(ts / 1000);
    c.pv.push(num(p.pv));
    c.sp.push(num(p.sp));
    c.u.push(num(p[w.input]));
  }
  return c.pv.some(Number.isFinite) ? assemble(c, w, pathId, metrics) : null;
}

/**
 * The names of the trends a redraw makes for sure, before anything is read: the CHG-197 builders run on the event's window with
 * no sample yet, so a trend shows here exactly when its quantities let it show. CHG-200 (controller C1): a trend or mark that
 * needs the samples to reproduce the engine's own number (Error from the setpoint, the setpoint, the settling bands) is never
 * promised here: it simply appears when it reproduces.
 */
export function plannedTrends(w: RedrawWindow, result: ResponseEventDetail['result'], metrics: ResponseQuantity[] | undefined, pvUnit?: string | null): string[] {
  const t = [w.t0Ms / 1000, w.tEndMs / 1000];
  const byKind = assemble({ t, pv: [NaN, NaN], sp: [NaN, NaN], u: [NaN, NaN] }, w, String(result.path_id ?? ''), metrics);
  const facts = buildFacts({ byKind, metrics, result, t0Ms: w.t0Ms, pvUnit });
  return facts ? responseTrendSpecs(facts).map(s => s.title).filter(name => name !== ERROR_TREND_TITLE) : [];
}
