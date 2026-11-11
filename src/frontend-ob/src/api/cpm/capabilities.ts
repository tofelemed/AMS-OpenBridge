/**
 * v2.5 — GET /api/v1/cpm/capabilities (spec v6 §5.3 capability manifest, R26/C07 build
 * identity). Mirrors Traverse.CplmApi.Services.CapabilityManifest.
 *
 * First module of the api/cpm/ split: new CPM endpoints live here, one file per area;
 * src/api/cpmApi.ts keeps serving the existing ones unchanged.
 */
import { apiJson } from '../apiFetch';

const BASE = '/api/v1/cpm';

/** One engine identity observed in stored results. Null fields = written by a pre-v2.5 jar. */
export interface CpmEngineIdentity {
  calculationVersion: string | null;
  dynamicsProfileVersion: string | null;
  sourceCommit: string | null;
  jarSha256: string | null;
  contractVersion: string | null;
  lastSeen: string | null;
}

export type CpmMethodState = 'INSTALLED' | 'LEGACY_FLAG_ONLY' | 'UNSUPPORTED';

export interface CpmInstalledMethod {
  gate: string;
  methodId: string;
  version: string;
  state: CpmMethodState;
}

export interface CpmCapabilities {
  service: { version: string; sourceCommit: string };
  engine: { observed: CpmEngineIdentity[] };
  methods: CpmInstalledMethod[];
  topics: Record<string, string>;
  schemas: Record<string, string>;
  /** The GET /resolutions body (window contract), embedded verbatim. */
  windows: unknown;
}

export const getCapabilities = () => apiJson<CpmCapabilities>(`${BASE}/capabilities`);

/**
 * 12-character prefix of a commit or digest for display. Anything that is not a real hash
 * ("unknown", "unknown-not-a-jar", null) is shown as-is: an abbreviated placeholder would
 * look like an identity, and the whole point of the field is not to invent one. CHG-174: a build from a working tree with
 * changes ("<commit>-dirty") keeps its mark after the 12 characters; it was shown whole.
 */
export function shortIdentity(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const m = /^([0-9a-f]{40,64})(-dirty)?$/i.exec(value);
  return m ? `${m[1].slice(0, 12)}${m[2] ?? ''}` : value;
}
