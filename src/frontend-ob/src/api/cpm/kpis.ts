/**
 * api/cpm/kpis — historian trend envelope, KPI stream and the resolutions catalogue. Split
 * out of ../cpmApi.ts in v2.5 (1E.2) for the file-size rule; ../cpmApi.ts re-exports
 * everything here, so existing imports keep working. New code imports from './cpm'.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE as BASE } from './base';

// ── Historian trend (envelope) ──────────────────────────────────────────────

export interface CpmTrendPoint {
  ts: number;
  [measurement: string]: number | string | null;
}

/** One measurement's last stored value, with the instant it was recorded. */
export interface CpmLastValue { value: number | string | null; ts: number }

/**
 * Last known value per measurement, from IoTDB, with NO time bound.
 *
 * The trend endpoint can only answer about its window, so a signal that did not
 * move inside it — a setpoint held for a month, a loop parked in AUT — reads as
 * null there and the card renders "—" for a value that is perfectly well known.
 * The live plane cannot cover it either: it is report-by-exception behind a TTL.
 * `ts` comes back per measurement so the UI can show age rather than implying the
 * value is live.
 */
export const getLastValues = (
  series: string, measurements = 'pv,sp,op,mode', signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ series, measurements });
  return apiJson<{ series: string; values: Record<string, CpmLastValue> }>(
    `/api/hist/last?${params.toString()}`, { signal });
};

/** envelope=true adds <m>_min/<m>_max/<m>_avg columns so oscillation renders truthfully. */
export const getTrend = (
  series: string, start: Date, end: Date, width = 300,
  measurements = 'pv,sp,op', envelope = true, signal?: AbortSignal,
) => {
  const params = new URLSearchParams({
    series,
    start: start.toISOString(),
    end: end.toISOString(),
    width: String(width),
    measurements,
    envelope: String(envelope),
  });
  return apiJson<{ series: string; envelope: boolean; points: CpmTrendPoint[] }>(
    `/api/hist/trend?${params.toString()}`, { signal });
};

// ── KPI stream (U2/U9): short/long feature rows carry the raw metric values ──

export interface CpmKpiRow {
  window_start: string | null;
  window_end: string | null;
  sample_count: number | null;
  created_at: string;
  /**
   * P1-9/P1-10 qualification flags ride along as booleans: `sufficient_data`
   * (short rows — false means the engine DECLINED the window and zeroed
   * mae/rmse/iae; those zeros must never render as perfect control) and
   * `long_metrics_qualified` (long rows — false means the metrics were computed
   * on a window that failed G0).
   *
   * Short rows also carry the per-window gate verdicts (`gate0_status` …
   * `gate4_status`, `gate2r_status` — PASS/WARN/FAIL/EXCLUDED/STRONG/PENDING):
   * fusion never fires on short windows, so these are the only gate evidence
   * that exists at 1m…60m.
   *
   * v2.5 workbench: every row also carries its run identity - `method_run_ids` (JSON text,
   * gate -> uuid), `bundle_hash`, `purpose` - and the short rows their recorded reasons
   * (`gate0_reason`, `evaluation_state`, `evaluation_reason`); rows written before v2.5 carry
   * `'{}'` and cannot be opened in the workbench.
   */
  [metric: string]: number | string | boolean | null;
}

export interface CpmKpiPage {
  loopId: string;
  resolution: string;
  tier: 'short' | 'long';
  count: number;
  /** Keyset cursor: pass as `before` to fetch the next (older) page; null at the end. */
  nextBefore: string | null;
  samples: CpmKpiRow[];
}

export const getKpis = (
  loopId: string, resolution = '12h', from?: string, to?: string, limit = 50, signal?: AbortSignal,
  before?: string,
) => {
  const params = new URLSearchParams({ resolution, limit: String(limit) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (before) params.set('before', before);
  return apiJson<CpmKpiPage>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/kpis?${params.toString()}`, { signal });
};

/**
 * CHG-024 — several resolutions' newest rows in one request (the Windows comparator's six
 * per-kind reads). Same rows as `getKpis(loopId, kind, undefined, undefined, limit)` per kind.
 */
export interface CpmKpisByResolution {
  loopId: string;
  limit: number;
  byResolution: Record<string, { tier: 'short' | 'long'; count: number; samples: CpmKpiRow[] }>;
}

export const getKpisByResolution = (
  loopId: string, resolutions: string[], limit = 12, signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ resolutions: resolutions.join(','), limit: String(limit) });
  return apiJson<CpmKpisByResolution>(
    `${BASE}/loops/${encodeURIComponent(loopId)}/kpis/latest?${params.toString()}`, { signal });
};

// ── Resolutions catalogue (U7): windows the engine actually emits ───────────

/**
 * The deployed window contract, served by the API so no screen hardcodes it.
 * `assigner` is 'tumbling' | 'sliding' | 'rolling-buffer' — the long tier is a
 * KeyedProcessFunction over a retained buffer, not a Flink window assigner.
 */
export interface CpmWindowSpec {
  kind: string;
  tier: 'short' | 'long';
  assigner: string;
  sizeMs: number;
  slideMs: number | null;
  allowedLatenessMs: number | null;
  cadenceMs: number | null;
  /** Slices below this sample count are not emitted at all. */
  minSamples: number | null;
  feeds: string;
  overlapping: boolean;
}

export interface CpmResolutions {
  shortWindows: string[];
  longWindows: string[];
  windows: CpmWindowSpec[];
  fusion: { firesOn: string[]; produces: string; note: string };
  gates: { key: string; name: string; tier: string }[];
  note: string;
}

export const getResolutions = () =>
  apiJson<CpmResolutions>(`${BASE}/resolutions`);
