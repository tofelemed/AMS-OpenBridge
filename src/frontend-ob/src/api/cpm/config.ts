/**
 * v2.5 Task 3D.1 (spec §5, §6.5): the governed gate-configuration API - the catalogue this build
 * carries, the effective configuration of a loop (what the engine actually runs under), drafts
 * (create / edit with If-Match / validate / shadow / approve) and deployments (activate / status
 * with the worker ACK matrix / rollback). Mirrors CpmConfigurationController and
 * CpmConfigDeploymentsController; the browser never resolves, hashes or decides anything here.
 */
import { apiFetch, apiJson, ApiError } from '../apiFetch';
import { CPM_BASE } from './base';
import type { CatalogueProperty, ChangeClass } from './configCatalogue.generated';

export type { CatalogueProperty, ChangeClass } from './configCatalogue.generated';

export type ScopeKind = 'SITE' | 'PROFILE' | 'LOOP' | 'REGIME';
export type LayerKind = 'FACTORY' | 'SITE' | 'PROFILE' | 'LOOP' | 'REGIME';
export type BundleState = 'DRAFT' | 'VALIDATED' | 'SHADOW_EVALUATED' | 'APPROVED' | 'SCHEDULED' | 'PREPARED' | 'ACTIVE_VERIFIED' | 'REJECTED' | 'EXPIRED'
  | 'PARTIALLY_ACKNOWLEDGED' | 'ACTIVATION_FAILED' | 'ROLLED_BACK' | 'SUPERSEDED';
export type DeploymentState = 'SCHEDULED' | 'PREPARING' | 'PREPARED' | 'APPLYING' | 'PROBING' | 'ACTIVE_VERIFIED' | 'PARTIALLY_ACKNOWLEDGED' | 'ACTIVATION_FAILED' | 'ROLLED_BACK';

export const RESET_TO_INHERITED = 'RESET_TO_INHERITED';

export interface CatalogueEntry extends Omit<CatalogueProperty, 'change_class'> {
  changeClass: ChangeClass;
  commissioningRequired: boolean;
  /** The build's declared reason no running job reads it (unsupported-in-build.json), else null. */
  notReadByBuild: string | null;
}

export interface ConfigCatalogue {
  catalogueHash: string; count: number; executionPlanHash: string;
  properties: CatalogueEntry[];
  workers: Array<{ jobName: string; jarSha256: string; catalogueHash: string; catalogueMatches: boolean }>;
  factoryLayerAvailable: boolean; profileIds: string[]; executionPlan: Record<string, unknown>;
}

export interface ConfigLayer { kind: LayerKind; ref: string | null; ordinal: number; content: Record<string, unknown>; content_hash: string }

export interface ResolvedBlock { properties: Record<string, unknown>; sources: Record<string, string>; execution_plan: Record<string, unknown> }

export interface ValidationReport { errors: string[]; warnings: string[]; notReadByBuild: Record<string, string>; changeClass: ChangeClass; validatedAt?: string; [k: string]: unknown }

export interface ApprovalRecord { approvalId: string; contentHash: string; approver: string; role: string; decision: 'APPROVED' | 'REJECTED'; note: string | null; expiresAt: string | null; createdAt: string; bindsCurrentContent: boolean }

export interface Bundle {
  bundleId: string; version: number; contentHash: string; site: string; scopeKind: ScopeKind; scopeRef: string | null; parentBundleId: string | null; parentHash: string | null;
  catalogueHash: string; executionPlanHash: string; changeClass: ChangeClass; state: BundleState;
  layers: ConfigLayer[]; resolved: ResolvedBlock; validation: ValidationReport | null; shadow: Record<string, unknown> | null;
  effectiveFrom: string | null; createdBy: string; createdAt: string; updatedAt: string; etag: string; note: string | null;
  /** Present on GET drafts/{id}: every approval decision recorded, flagged when it binds the current content. */
  approvals?: ApprovalRecord[];
}

export interface WorkerAck { status: 'ACK' | 'NACK'; bundleHash: string; jarSha256: string; reason: string | null; receivedAt: string }

export interface Deployment {
  deploymentId: string; bundleId: string; contentHash: string; kind: 'ACTIVATE' | 'ROLLBACK'; rollbackOf: string | null; scheduledFor: string | null;
  state: DeploymentState; error: string | null; epoch: number | null; probeResults: Record<string, unknown> | null; createdBy: string; createdAt: string; updatedAt: string;
  requiredMembers: string[];
  ackMatrix: Array<{ jobName: string; prepare: WorkerAck | null; apply: WorkerAck | null }>;
  active: boolean; semantics: string;
}

export interface EffectiveWorker { jobName: string; jarSha256: string; catalogueHash: string; ack?: { status: string; bundleHash: string; jarSha256: string; receivedAt: string } | null }

export interface EffectiveConfig {
  loopId: string; site: string; profileId: string; state: BundleState | 'NO_ACTIVE_BUNDLE'; note?: string;
  bundle: { bundleId: string; version: number; contentHash: string; scopeKind: ScopeKind; scopeRef: string | null; changeClass: ChangeClass; effectiveFrom: string | null; catalogueHash: string } | null;
  properties: Record<string, unknown>; sources: Record<string, string>; layers?: ConfigLayer[]; effectiveHash?: string;
  workers: EffectiveWorker[];
}

export interface PatchOp { op: 'set' | 'reset'; property: string; value?: unknown }

export const getConfigCatalogue = (signal?: AbortSignal) => apiJson<ConfigCatalogue>(`${CPM_BASE}/configuration/catalogue`, { signal });

export const getEffectiveConfig = (loopId: string, at?: string, signal?: AbortSignal) =>
  apiJson<EffectiveConfig>(`${CPM_BASE}/configuration/effective?loopId=${encodeURIComponent(loopId)}${at ? `&at=${encodeURIComponent(at)}` : ''}`, { signal });

export const listBundles = (site: string, opts: { scopeKind?: ScopeKind; scopeRef?: string; state?: string } = {}, signal?: AbortSignal) => {
  const p = new URLSearchParams({ site });
  if (opts.scopeKind) p.set('scopeKind', opts.scopeKind);
  if (opts.scopeRef) p.set('scopeRef', opts.scopeRef);
  if (opts.state) p.set('state', opts.state);
  return apiJson<{ site: string; bundles: Bundle[] }>(`${CPM_BASE}/configuration/drafts?${p.toString()}`, { signal });
};

export const getBundle = (id: string, signal?: AbortSignal) => apiJson<Bundle>(`${CPM_BASE}/configuration/drafts/${encodeURIComponent(id)}`, { signal });

export const listDeployments = (q: { bundleId?: string; site?: string; limit?: number }, signal?: AbortSignal) => {
  const p = new URLSearchParams();
  if (q.bundleId) p.set('bundleId', q.bundleId);
  if (q.site) p.set('site', q.site);
  if (q.limit) p.set('limit', String(q.limit));
  return apiJson<{ count: number; deployments: Deployment[] }>(`${CPM_BASE}/configuration/deployments?${p.toString()}`, { signal });
};

export const getDeployment = (id: string, signal?: AbortSignal) => apiJson<Deployment>(`${CPM_BASE}/configuration/deployments/${encodeURIComponent(id)}`, { signal });

async function send<T>(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await apiFetch(`${CPM_BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string | undefined;
    let payload: unknown;
    try { payload = await res.json(); detail = (payload as { error?: string }).error; } catch { /* no body */ }
    const message = res.status === 409 ? (detail ?? 'The bundle changed under you; reload and edit again.')
      : res.status === 403 ? (detail ?? 'Your account lacks the permission for this step.')
      : res.status === 422 ? (detail ?? 'Rejected by validation.')
      : detail ?? `request failed (HTTP ${res.status})`;
    const err = new ApiError(res.status, message, detail);
    (err as ApiError & { payload?: unknown }).payload = payload;
    throw err;
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

export const createDraft = (req: { site: string; scopeKind: ScopeKind; scopeRef?: string | null; parentBundleId?: string | null; note?: string }) =>
  send<Bundle>('/configuration/drafts', 'POST', req);

/** Requested changes only; If-Match binds the edit to the bundle version the editor saw (409 when stale). */
export const patchDraft = (id: string, etag: string, ops: PatchOp[]) =>
  send<Bundle>(`/configuration/drafts/${encodeURIComponent(id)}`, 'PATCH', { ops }, { 'If-Match': etag });

export const validateDraft = (id: string) => send<Bundle>(`/configuration/drafts/${encodeURIComponent(id)}/validate`, 'POST');

export const shadowDraft = (id: string, req: { loopId?: string; hours?: number }) =>
  send<{ bundleId: string; analysisRunId: string; jobId: string; loopId: string; fromMs: number; toMs: number; statusUrl: string }>(`/configuration/drafts/${encodeURIComponent(id)}/shadow`, 'POST', req);

export const approveDraft = (id: string, req: { note?: string; validityHours?: number }) => send<Bundle>(`/configuration/drafts/${encodeURIComponent(id)}/approve`, 'POST', req);

export const createDeployment = (req: { bundleId: string; scheduledFor?: string | null }) => send<Deployment>('/configuration/deployments', 'POST', req);

export const rollbackDeployment = (id: string) => send<Deployment>(`/configuration/deployments/${encodeURIComponent(id)}/rollback`, 'POST');
