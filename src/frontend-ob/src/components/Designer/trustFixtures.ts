/**
 * CHG-176 test data, shared by the Designer binding-trust tests (not a test itself). A lab-like loop (FIC10401, its
 * signals in the loop registry), two plain tags, and the binding resolver's two answers for any path: from the asset
 * model, or derived from the path string ("fallback"). The two answers point at different live devices with different
 * values, so a test can tell which one a display read.
 */
import type { LiveMetric } from '../../store/mqttStore';

const UNIT = 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5';
export const LOOP_PV = `${UNIT}/fic10401.pv`;
export const LOOP_SP = `${UNIT}/fic10401.sp`;
export const LOOP_OP = `${UNIT}/fic10401.op`;
export const TAG = 'hdpe/section_100/u1001_feed/pt10001.pv';
export const TAG2 = 'hdpe/section_100/u1001_feed/tt10002.pv';

export const LOOPS_URL = '/api/v1/cpm/loops';
export const LOOPS = { count: 1, loops: [{ loopId: 'FIC10401', tags: { PV: LOOP_PV, SP: LOOP_SP, OP: LOOP_OP } }] };

/** The value each answer's device publishes. */
export const MODEL_VALUE = 12.3;
export const DERIVED_VALUE = 45.6;

export const REASON_FALLBACK = 'Binding not confirmed by the asset model';
export const REASON_LOOP = 'Loop signal not resolved: the asset model did not answer';

type Provenance = 'asset-model' | 'fallback';
const leaf = (p: string) => p.split('/').pop() ?? p;
const deviceOf = (p: string, prov: Provenance) => (prov === 'asset-model' ? '' : 'derived_') + leaf(p).split('.')[0];
const metricOf = (p: string) => leaf(p).split('.').pop() ?? 'value';

export const topicOf = (p: string, prov: Provenance) => `spBv1.0/g/DDATA/e/${deviceOf(p, prov)}`;
export const liveKeyOf = (p: string, prov: Provenance) => `${deviceOf(p, prov)}/${metricOf(p)}`;
export const historyOf = (p: string, prov: Provenance) =>
  (prov === 'asset-model' ? 'root.hdpev2.cpm.' : 'root.hdpe.derived.') + `${leaf(p).split('.')[0]}.${metricOf(p)}`;

/** The resolver's answer for one path. A fallback still says `resolved: true`. */
export function resolverAnswer(path: string, provenance: Provenance) {
  const device = deviceOf(path, provenance);
  return {
    contextualPath: path,
    resolved: true,
    provenance,
    live: {
      sparkplugTopic: topicOf(path, provenance), sparkplugGroup: 'g', sparkplugEdgeNode: 'e',
      sparkplugDevice: device, sparkplugMetric: metricOf(path), snapshotEndpoint: '/api/hist/snapshot',
    },
    history: { ioTDbPath: historyOf(path, provenance), trendEndpoint: '/api/hist/trend', rawEndpoint: '/api/hist/raw' },
  };
}

export interface FakeApi {
  /** Paths the resolver answers with provenance "fallback". */
  fallback: string[];
  /** How the loop registry answers. */
  loops: 'ok' | 'fail';
  /** A display's published content, for the viewer. */
  content?: unknown;
  /** Every read, as "METHOD url". */
  calls: string[];
}

export const fakeApi = (over: Partial<FakeApi> = {}): FakeApi => ({ fallback: [], loops: 'ok', calls: [], ...over });

/** Answers the Designer's reads: binding resolve (GET one, POST batch), the loop registry, a display's content. */
export function fakeAnswer(api: FakeApi, url: string, init?: RequestInit): { status: number; body: unknown } {
  api.calls.push(`${init?.method ?? 'GET'} ${url}`);
  const prov = (p: string): Provenance => (api.fallback.includes(p) ? 'fallback' : 'asset-model');
  if (url.includes('/resolve/batch')) {
    const asked = JSON.parse(String(init?.body ?? '{}')) as { bindings: Array<{ path: string }> };
    return { status: 200, body: { bindings: asked.bindings.map(b => resolverAnswer(b.path, prov(b.path))) } };
  }
  if (url.includes('/resolve?')) {
    const path = new URL(url, 'http://test').searchParams.get('path') ?? '';
    return { status: 200, body: resolverAnswer(path, prov(path)) };
  }
  if (url.endsWith(LOOPS_URL)) return api.loops === 'ok' ? { status: 200, body: LOOPS } : { status: 503, body: { error: 'down' } };
  if (url.includes('/content?stage=published')) return { status: 200, body: api.content };
  return { status: 404, body: null };
}

/** A Response-like answer for a mocked apiFetch. */
export function fakeResponse(a: { status: number; body: unknown }): Response {
  return { ok: a.status < 400, status: a.status, json: async () => a.body } as unknown as Response;
}

/** Live values on both answers' devices: the asset model's value and the derived one (a wrong read would show it). */
export function liveFor(paths: string[], quality = 192): Map<string, LiveMetric> {
  const m = new Map<string, LiveMetric>();
  const ts = Date.now();
  for (const p of paths) {
    m.set(liveKeyOf(p, 'asset-model'), { value: MODEL_VALUE, quality, ts });
    m.set(liveKeyOf(p, 'fallback'), { value: DERIVED_VALUE, quality, ts });
  }
  return m;
}

export const loopReads = (api: FakeApi) => api.calls.filter(c => c.endsWith(LOOPS_URL)).length;
