/**
 * v2.5 Task 2D.1 (spec §3.1, R13): the gate catalogue as the BUILD knows it - definition, role in
 * fusion, installed method and version, the evidence artifact kinds the engine emits, capability
 * state. The workbench (2E.3) reads roles and definitions from here; the static GATE_ROLES tables
 * and calcCatalogue.ts are retired with it. Mirrors Traverse.CplmApi.Services.GateCatalog.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export type GateRole = 'BLOCKING' | 'ELIGIBILITY' | 'PERFORMANCE' | 'PRIMARY' | 'SUPPORTING' | 'CONTEXT' | 'CONFIRMATION' | 'FUSION';
export type GateTier = 'short' | 'long' | 'fusion';
export type GateCapabilityState = 'INSTALLED' | 'LEGACY_FLAG_ONLY' | 'UNAVAILABLE';

export interface GateCatalogueEntry {
  gate: string;
  name: string;
  tier: GateTier;
  role: GateRole;
  definition: string;
  preconditions: string;
  method: { id: string; version: string; state: 'INSTALLED' | 'LEGACY_FLAG_ONLY' };
  artifactKinds: string[];
  propertyIds: string[];
  capabilityState: GateCapabilityState;
  capabilityReason: string | null;
}

export interface GateCatalogue {
  count: number;
  gates: GateCatalogueEntry[];
  service: { version: string; sourceCommit: string };
}

export const getGateCatalogue = () => apiJson<GateCatalogue>(`${CPM_BASE}/gate-catalogue`);

/** Role lookup for a fetched catalogue; '—' (never a guess) when the gate is unknown to the build. */
export function gateRole(catalogue: GateCatalogue | undefined, gate: string): string {
  return catalogue?.gates.find(g => g.gate === gate)?.role ?? '—';
}
