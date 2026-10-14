/**
 * CHG-097 (SME review 2 #17): the Historical page's three downloads, each labelled for what it holds and each carrying the
 * loop's identity, the period, the time zone and the units:
 *   - signal samples   — PV / SP / OP / VP / mode from the historian over the range (CSV)
 *   - evaluated windows — the fused windows and their diagnoses over the range (CSV or JSON)
 *   - evidence package — one evaluated window: verdict, every gate, its metrics, the evidence manifests and the signal
 *                        samples over exactly that window (JSON)
 * Builders are pure (unit-tested); the two fetchers only read existing endpoints.
 */
import type { CpmLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { getKpis, getTrend, type CpmTrendPoint } from '../../../api/cpm/kpis';
import { getEvidenceBatch } from '../../../api/cpm/evidence';
import { formatInZone, zoneLabel } from '../evidence/timezone';
import { diagnosisLabel } from '../vocabulary';

export interface ExportContext { loopId: string; loop?: CpmLoop; from: Date; to: Date; timeZone: string }

/** The historian answers at most this many buckets per request (historian-bff clamps width to 2000). */
export const HISTORIAN_MAX_BUCKETS = 2000;
/** A sample export never exceeds this many rows; a longer range is exported at a coarser bucket, and the file says so. */
export const SAMPLE_ROW_CAP = 60_000;
export const SAMPLE_SIGNALS = ['pv', 'sp', 'op', 'vp', 'mode'] as const;

const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Units per signal: PV and SP in the loop's PV unit, OP and VP in %, mode as the DCS code. */
export function unitOf(signal: string, loop?: CpmLoop): string {
  if (signal === 'pv' || signal === 'sp') return loop?.engineering?.pvUnit?.trim() || 'PV unit (not registered)';
  if (signal === 'op' || signal === 'vp') return '%';
  return signal === 'mode' ? 'code' : '';
}

/** "# key: value" lines every export starts with — the file explains itself away from the screen. */
export function headerLines(ctx: ExportContext, what: string, extra: Array<[string, string]> = []): string[] {
  const l = ctx.loop;
  const rows: Array<[string, string]> = [
    ['content', what],
    ['loop', ctx.loopId],
    ...(l?.displayName && l.displayName !== ctx.loopId ? [['name', l.displayName] as [string, string]] : []),
    ...(l ? [['plant', [l.site, l.area, l.unit].filter(Boolean).join(' / ')] as [string, string]] : []),
    ['period', `${ctx.from.toISOString()} to ${ctx.to.toISOString()}`],
    ['time zone', `${zoneLabel(ctx.timeZone, ctx.from.getTime())} (time_site column); time_utc is ISO 8601 UTC`],
    ...extra,
    ['exported', new Date().toISOString()],
  ];
  return rows.map(([k, v]) => `# ${k}: ${v}`);
}

/** Evaluated windows and their diagnoses (what the old "Export CSV" held, now labelled and self-describing). */
export function windowsCsv(ctx: ExportContext, windows: CpmGateMatrix[], truncated: boolean, cap: number): string {
  const head = headerLines(ctx, 'evaluated windows (fused verdicts) - not signal samples', [
    ['confidence', 'evidence score 0-1 (shown x100 in the app)'],
  ]);
  const cols = 'window_kind,window_start_utc,window_end_utc,window_end_site,diagnosis,diagnosis_text,severity,confidence,sample_count,calculation_version';
  const rows = windows.map(w => [
    w.windowKind, w.windowStart ?? '', w.windowEnd ?? '', w.windowEnd ? formatInZone(Date.parse(w.windowEnd), ctx.timeZone) : '',
    w.diagnosis ?? '', w.diagnosis ? diagnosisLabel(w.diagnosis) : '', w.severity ?? '', w.confidence ?? '', w.sampleCount ?? '',
    w.metadata?.calculationVersion ?? '',
  ].map(csvCell).join(','));
  const foot = truncated ? [`# TRUNCATED: hit the ${cap}-window API cap; older windows in range are not included`] : [];
  return [...head, cols, ...rows, ...foot].join('\n');
}

export function windowsJson(ctx: ExportContext, windows: CpmGateMatrix[], truncated: boolean, cap: number): string {
  return JSON.stringify({
    content: 'evaluated windows (fused verdicts)', loopId: ctx.loopId, from: ctx.from.toISOString(), to: ctx.to.toISOString(),
    timeZone: ctx.timeZone, truncated, windowCap: truncated ? cap : undefined, windows,
  }, null, 2);
}

/** Signal samples as CSV: one row per historian bucket, both clocks, one column per signal with its unit. */
export function samplesCsv(ctx: ExportContext, points: CpmTrendPoint[], bucketS: number, coarsened: boolean): string {
  const head = headerLines(ctx, 'signal samples from the historian', [
    ['series', `root...${ctx.loopId}`],
    ['resolution', `${bucketS} s buckets (the historian value in each bucket; the average when a bucket holds more than one sample)`
      + (coarsened ? ` - coarsened to stay within ${SAMPLE_ROW_CAP} rows; narrow the range for every sample` : '')],
    ['units', SAMPLE_SIGNALS.map(s => `${s} = ${unitOf(s, ctx.loop)}`).join('; ')],
  ]);
  const cols = ['time_utc', 'time_site', ...SAMPLE_SIGNALS.map(s => `${s} [${unitOf(s, ctx.loop)}]`)].map(csvCell).join(',');
  const rows = points.map(p => [new Date(p.ts).toISOString(), formatInZone(p.ts, ctx.timeZone), ...SAMPLE_SIGNALS.map(s => p[s] ?? '')]
    .map(csvCell).join(','));
  return [...head, cols, ...rows].join('\n');
}

/** The bucket size for a sample export: the loop's sample period, coarser only when the range would exceed the row cap. */
export function sampleBucketS(from: Date, to: Date, gridS: number | null | undefined): { bucketS: number; coarsened: boolean } {
  const spanS = Math.max(1, (to.getTime() - from.getTime()) / 1000);
  const grid = gridS && gridS > 0 ? gridS : 5;
  const minForCap = Math.ceil(spanS / SAMPLE_ROW_CAP);
  return minForCap > grid ? { bucketS: minForCap, coarsened: true } : { bucketS: grid, coarsened: false };
}

/** Reads the range in slices of at most HISTORIAN_MAX_BUCKETS buckets at the chosen size, oldest first, de-duplicated. */
export async function fetchSamples(series: string, from: Date, to: Date, bucketS: number, signal?: AbortSignal): Promise<CpmTrendPoint[]> {
  const sliceMs = bucketS * 1000 * HISTORIAN_MAX_BUCKETS;
  const out = new Map<number, CpmTrendPoint>();
  for (let t = from.getTime(); t < to.getTime(); t += sliceMs) {
    const end = new Date(Math.min(to.getTime(), t + sliceMs));
    const width = Math.max(10, Math.min(HISTORIAN_MAX_BUCKETS, Math.ceil((end.getTime() - t) / (bucketS * 1000))));
    const r = await getTrend(series, new Date(t), end, width, SAMPLE_SIGNALS.join(','), false, signal);
    for (const p of r.points) out.set(p.ts, p);
  }
  return Array.from(out.values()).sort((a, b) => a.ts - b.ts);
}

/** One evaluated window with everything needed to check it away from the app. */
export async function evidencePackage(ctx: ExportContext, w: CpmGateMatrix, series: string, signal?: AbortSignal): Promise<string> {
  const start = w.windowStart ? new Date(w.windowStart) : ctx.from;
  const end = w.windowEnd ? new Date(w.windowEnd) : ctx.to;
  const runIds = Object.values(w.methodRunIds ?? {});
  const { bucketS, coarsened } = sampleBucketS(start, end, ctx.loop?.model?.acquisition?.gridSeconds);
  const [kpis, manifests, samples] = await Promise.all([
    getKpis(ctx.loopId, w.windowKind, w.windowEnd ?? undefined, w.windowEnd ?? undefined, 1, signal).catch(e => ({ error: String(e) })),
    runIds.length ? getEvidenceBatch(runIds, signal).catch(e => ({ error: String(e) })) : Promise.resolve(null),
    fetchSamples(series, start, end, bucketS, signal),
  ]);
  const l = ctx.loop;
  return JSON.stringify({
    content: 'CPA evidence package - one evaluated window',
    packageVersion: 1,
    exported: new Date().toISOString(),
    loop: {
      loopId: ctx.loopId, displayName: l?.displayName, site: l?.site, area: l?.area, unit: l?.unit, loopType: l?.loopType,
      engineering: l?.engineering ?? null, commandPath: l?.model?.commandPath ?? null, gridSeconds: l?.model?.acquisition?.gridSeconds ?? null,
    },
    period: { windowKind: w.windowKind, startUtc: w.windowStart, endUtc: w.windowEnd, timeZone: zoneLabel(ctx.timeZone, end.getTime()) },
    units: Object.fromEntries(SAMPLE_SIGNALS.map(s => [s, unitOf(s, l)])),
    verdict: {
      diagnosis: w.diagnosis, diagnosisText: w.diagnosis ? diagnosisLabel(w.diagnosis) : null, severity: w.severity,
      evidenceScore: w.confidence, sampleCount: w.sampleCount, insufficientEvidenceReason: w.insufficientEvidenceReason,
      observabilityFlags: w.observabilityFlags, familyDisqualifiers: w.familyDisqualifiers,
      bundleHash: w.bundleHash ?? null, resultRevision: w.resultRevision ?? null,
    },
    gates: w.gates,
    metrics: 'samples' in (kpis as object) ? (kpis as { samples: unknown[] }).samples[0] ?? null : kpis,
    evidence: { methodRunIds: w.methodRunIds ?? {}, manifests },
    samples: { resolutionS: bucketS, coarsened, signals: SAMPLE_SIGNALS, points: samples },
  }, null, 2);
}
