/**
 * Test data for the Gate Configuration page tests (CHG-169): the lab's shape - FIC10302 runs LOOP v6 (active, verified) with v7
 * rolled back and v4 superseded; FIC10301 has an empty draft; one validated and one approved bundle exercise the later steps.
 * Read-only fixtures: imported by tests only.
 */
import { ApiError } from '../../../api/apiFetch';

const HASH6 = 'f9153b00aaf3ba1a3b19c0de';
export const LOOPS = { loops: [
  { loopId: 'FIC10302', displayName: 'Reactor feed flow', site: 'hdpe', area: 'a', unit: 'u1001', loopType: 'FIC', tags: {}, links: [], observabilityFlags: [] },
  { loopId: 'FIC10301', displayName: 'Flow controller FIC10301 (FCS0101)', site: 'hdpe', area: 'a', unit: 'u4002', loopType: 'FIC', tags: {}, links: [], observabilityFlags: [] },
] };

const v6bundle = { bundleId: 'l6', version: 6, contentHash: HASH6, scopeKind: 'LOOP', scopeRef: 'FIC10302', changeClass: 'POLICY', effectiveFrom: '2026-09-25T18:37:00Z', catalogueHash: '8bbcbbbb7da04ddc' };
export const EFFECTIVE = {
  loopId: 'FIC10302', site: 'hdpe', profileId: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED', bundle: v6bundle,
  properties: { 'G0.mode': 'OPERATIONAL', 'G4.activity_warn_ratio': 4.5, 'G4.activity_high_ratio': 8, 'G12.noise_multiplier': 4 },
  sources: { 'G0.mode': 'FACTORY', 'G4.activity_warn_ratio': 'LOOP', 'G4.activity_high_ratio': 'PROFILE', 'G12.noise_multiplier': 'FACTORY' },
  workers: ['Short Feature Engine', 'Gate Fusion Engine'].map(j => ({ jobName: `AMS - CPLM ${j}`, jarSha256: 'dabe186270133b84', catalogueHash: '8bbcbbbb7da04ddc',
    ack: { status: 'ACK', bundleHash: HASH6, jarSha256: 'dabe186270133b84', receivedAt: 't' } })),
};

export const CATALOGUE = { catalogueHash: '8bbcbbbb7da04ddc', count: 4, executionPlanHash: 'e', factoryLayerAvailable: true, profileIds: ['FLOW_FAST_SELF_REG'], executionPlan: {}, workers: [], properties: [
  { property: 'G0.mode', id: 'CFG-001', gate: 'G0', type: 'enum', unit: 'state', effect: 'Diagnostic execution mode', default: 'OPERATIONAL', validation: ['OPERATIONAL', 'SHADOW'], dependencies: [], consumers: ['flink:short'], changeClass: 'POLICY', commissioningRequired: false, notReadByBuild: null },
  { property: 'G4.activity_warn_ratio', id: 'CFG-077', gate: 'G4', type: 'number', unit: 'dimensionless', effect: 'Ratio versus approved regime-specific activity reference', default: null, validation: { minimum: 0, maximum: 10000 }, dependencies: [], consumers: ['flink:short'], changeClass: 'POLICY', commissioningRequired: true, notReadByBuild: null },
  { property: 'G4.activity_high_ratio', id: 'CFG-078', gate: 'G4', type: 'number', unit: 'dimensionless', effect: 'High ratio must exceed warning', default: null, validation: { minimum: 0, maximum: 10000 }, dependencies: ['G4.activity_warn_ratio'], consumers: ['flink:short'], changeClass: 'POLICY', commissioningRequired: true, notReadByBuild: null },
  { property: 'G12.noise_multiplier', id: 'CFG-120', gate: 'G12', type: 'number', unit: 'dimensionless', effect: 'Noise band', default: 4, validation: {}, dependencies: [], consumers: ['flink:response'], changeClass: 'STATE_BOUNDARY', commissioningRequired: false, notReadByBuild: null },
] };

const summary = (id: string, version: number, state: string, over: Record<string, unknown> = {}) => ({
  bundleId: id, version, contentHash: id === 'l6' ? HASH6 : `${id}00000000000000`, site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state,
  effectiveFrom: null, createdBy: 'e2e_cfg_engineer', createdAt: '2026-09-25T18:36:00Z', updatedAt: '2026-09-25T18:37:00Z', note: 'slice-3 e2e', validationErrors: 0, ...over,
});
export const LOOP_LEVEL = [
  summary('l7', 7, 'ROLLED_BACK', { updatedAt: '2026-09-25T18:37:30Z', note: 'slice-3 e2e v2' }),
  summary('l6', 6, 'ACTIVE_VERIFIED', { effectiveFrom: '2026-09-25T18:37:00Z', updatedAt: '2026-09-25T18:37:20Z' }),
  summary('l4', 4, 'SUPERSEDED', { updatedAt: '2026-09-25T18:37:10Z' }),
  summary('l1', 1, 'SUPERSEDED', { updatedAt: '2026-09-25T14:31:00Z' }),
];
export const IN_PROGRESS = [summary('d1', 1, 'DRAFT', { scopeRef: 'FIC10301', createdBy: 'admin', note: null })];

const layers = (loop: Record<string, unknown>) => [
  { kind: 'FACTORY', ref: null, ordinal: 0, content: { 'G0.mode': 'OPERATIONAL', 'G12.noise_multiplier': 4 }, content_hash: 'f' },
  { kind: 'PROFILE', ref: 'FLOW_FAST_SELF_REG', ordinal: 2, content: { 'G4.activity_warn_ratio': 3, 'G4.activity_high_ratio': 8 }, content_hash: 'p' },
  { kind: 'LOOP', ref: 'FIC10302', ordinal: 3, content: loop, content_hash: 'l' },
];
const full = (id: string, version: number, state: string, loop: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  ...summary(id, version, state), parentHash: null, catalogueHash: '8bbcbbbb7da04ddc', executionPlanHash: 'e', layers: layers(loop),
  resolved: { properties: { 'G0.mode': 'OPERATIONAL', 'G12.noise_multiplier': 4, 'G4.activity_warn_ratio': 3, 'G4.activity_high_ratio': 8, ...loop },
    sources: { 'G0.mode': 'FACTORY', 'G12.noise_multiplier': 'FACTORY', 'G4.activity_warn_ratio': 'G4.activity_warn_ratio' in loop ? 'LOOP' : 'PROFILE', 'G4.activity_high_ratio': 'PROFILE' }, execution_plan: {} },
  validation: { errors: [], warnings: [], notReadByBuild: {}, changeClass: 'POLICY' }, shadow: null, etag: `W/"${id}-1"`, approvals: [], ...over,
});
export const BUNDLES: Record<string, unknown> = {
  l6: full('l6', 6, 'ACTIVE_VERIFIED', { 'G4.activity_warn_ratio': 4.5 }, { contentHash: HASH6, etag: '6c8eae20025f98e6', effectiveFrom: '2026-09-25T18:37:00Z',
    approvals: [{ approvalId: 'a1', contentHash: HASH6, approver: 'admin', role: 'Admin', decision: 'APPROVED', note: 'slice-3 e2e review', expiresAt: '2026-09-25T20:37:00Z', createdAt: 't', bindsCurrentContent: true }] }),
  d1: full('d1', 1, 'DRAFT', {}, { scopeRef: 'FIC10301', createdBy: 'admin', note: null, validation: null, layers: layers({}).map(l => (l.kind === 'LOOP' ? { ...l, ref: 'FIC10301' } : l)) }),
  dv: full('dv', 2, 'VALIDATED', { 'G4.activity_warn_ratio': 5 }, { scopeRef: 'FIC10301', createdBy: 'alice' }),
  da: full('da', 3, 'APPROVED', { 'G4.activity_warn_ratio': 5 }, { scopeRef: 'FIC10301', createdBy: 'alice',
    approvals: [{ approvalId: 'a2', contentHash: 'da00000000000000', approver: 'bob', role: 'Reviewer', decision: 'APPROVED', note: 'ok', expiresAt: '2999-01-01T00:00:00Z', createdAt: 't', bindsCurrentContent: true }] }),
};

const ack = { status: 'ACK', bundleHash: HASH6, jarSha256: 'dabe186270133b84', reason: null, receivedAt: 't' };
const matrix = ['Short Feature Engine', 'Gate Fusion Engine'].map(j => ({ jobName: `AMS - CPLM ${j}`, prepare: ack, apply: ack }));
const deployment = (id: string, kind: string, over: Record<string, unknown> = {}) => ({
  deploymentId: id, bundleId: 'l6', contentHash: HASH6, kind, rollbackOf: null, scheduledFor: null, state: 'ACTIVE_VERIFIED', error: null, epoch: null,
  probeResults: { pinnedResults: 648, checkedAt: '2026-09-25T18:37:00Z' }, createdBy: 'admin', createdAt: '2026-09-25T18:37:00Z', updatedAt: 't',
  requiredMembers: matrix.map(m => m.jobName), ackMatrix: matrix, active: true, semantics: 'ACTIVE_VERIFIED after every required worker ACKed', ...over,
});
export const DEPLOYMENTS: Record<string, unknown[]> = {
  l6: [deployment('d-rb', 'ROLLBACK', { rollbackOf: '617f2e13-2ef0-4c5d-9a1b-0123456789ab', createdAt: '2026-09-25T18:38:00Z' }), deployment('d-act', 'ACTIVATE')],
};

/** The GET answers of the page; a test may override any of them. */
export function respond(url: string, over: Partial<Record<'missing', boolean>> = {}): unknown {
  if (url.includes('/gate-catalogue')) return { gates: [{ gate: 'G0', role: 'BLOCKING' }, { gate: 'G9', role: 'SUPPORTING' }] };
  if (url.includes('/configuration/effective/summary')) return { count: 2, loops: [
    { loopId: 'FIC10302', displayName: 'Reactor feed flow', site: 'hdpe', area: 'a', unit: 'u1001', loopType: 'FIC', profileId: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED', bundle: { ...v6bundle, since: null } },
    { loopId: 'FIC10301', displayName: 'Flow controller FIC10301 (FCS0101)', site: 'hdpe', area: 'a', unit: 'u4002', loopType: 'FIC', profileId: 'FLOW_FAST_SELF_REG', state: 'NO_ACTIVE_BUNDLE', bundle: null },
  ] };
  if (url.includes('/configuration/effective?')) return EFFECTIVE;
  if (url.includes('/configuration/catalogue')) return CATALOGUE;
  if (url.includes('/configuration/drafts?')) {
    const q = new URL(`http://x${url}`).searchParams;
    if (q.get('projection') !== 'summary') throw new Error(`lists must read summary rows: ${url}`);
    const kind = q.get('scopeKind');
    if (kind === 'LOOP') return { site: 'hdpe', projection: 'summary', bundles: q.get('scopeRef') === 'FIC10302' ? LOOP_LEVEL : [] };
    if (kind) return { site: 'hdpe', projection: 'summary', bundles: [] };
    return { site: 'hdpe', projection: 'summary', bundles: [...LOOP_LEVEL, ...IN_PROGRESS] };
  }
  const one = url.match(/\/configuration\/drafts\/([^/?]+)$/);
  if (one) {
    if (over.missing || !BUNDLES[one[1]]) throw new ApiError(404, `bundle ${one[1]} not found`);
    return BUNDLES[one[1]];
  }
  if (url.includes('/configuration/drafts/') && url.endsWith('/shadow')) return { bundleId: 'x', analysisRunId: null, runState: 'NONE', loopId: null, fromMs: null, toMs: null, shadowRows: 0, comparedWindows: 0, symptomsRemoved: 0, symptomsAdded: 0, reclassification: null, comparedAt: 't', windows: [] };
  if (url.includes('/configuration/deployments?')) {
    const id = new URL(`http://x${url}`).searchParams.get('bundleId') ?? '';
    const list = DEPLOYMENTS[id] ?? [];
    return { count: list.length, deployments: list };
  }
  if (url.includes('/assets/filters')) return { sites: ['hdpe'], areas: [], units: [] };
  if (url.includes('/loops')) return LOOPS;
  throw new Error(`unexpected request ${url}`);
}
