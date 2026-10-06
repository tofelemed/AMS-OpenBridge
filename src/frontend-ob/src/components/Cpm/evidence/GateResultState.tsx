/**
 * v2.5 Task 2E.1 (spec §3.5; NR-034): a gate cell in the workbench is always in ONE stated state.
 * "No chart" is never silent: each state says why, which results remain valid, and the next valid
 * action (reconstruct evidence, go to a later run, fix a prerequisite). Pure classification +
 * an OpenBridge-token panel; the views call this whenever their artifacts are not READY.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, TonePill, type CpmTone } from '../shared';
import { codeLabel, phrase } from '../vocabulary';

export type GateStateKind =
  | 'LOADING' | 'NO_RESULT' | 'NOT_EVALUATED' | 'SHORT_TIER' | 'UNSUPPORTED_METHOD' | 'NOT_RETAINED' | 'EVIDENCE_PENDING'
  | 'EVIDENCE_EXPIRED' | 'FAILED_REQUEST' | 'SHADOW' | 'DISABLED' | 'READY';

/** The gates the short tier judges on the 1m…60m windows; a fused row carries no verdict of its own for them. */
export const SHORT_GATES: ReadonlySet<string> = new Set(['G0', 'G1', 'G2', 'G2r', 'G3', 'G4']);

export interface GateStateInput {
  loading: boolean;
  error: unknown;
  cell: { key: string; status: string; reason: string | null } | null;
  catalogue: { capabilityState: string; capabilityReason: string | null; method: { id: string; version: string; state: string } } | null;
  manifest: { readiness: string; count: number } | null;
  methodRun: { purpose: string } | null;
  /** The run's tier (fusion / short / long / response) - a short gate on a fusion run is SHORT_TIER. */
  tier?: 'fusion' | 'short' | 'long' | 'response' | null;
  gate?: string;
  loopId?: string;
}

export interface GateState {
  kind: GateStateKind;
  title: string;
  detail: string;
  /** What a reader may still rely on in this state. */
  stillValid: string;
  action: 'RECONSTRUCT' | 'RETRY' | 'GO_TO_LATEST' | 'NONE';
  tone: CpmTone;
  /** Where the answer lives when it is another page or selection. */
  link?: { label: string; href: string };
}

export function classifyGateResult(i: GateStateInput): GateState {
  if (i.loading) return { kind: 'LOADING', title: 'Loading the selected run', detail: 'The method run, its verdict and its evidence are being fetched.', stillValid: '', action: 'NONE', tone: 'muted' };
  if (i.error) {
    const msg = i.error instanceof Error ? i.error.message : String(i.error);
    return { kind: 'FAILED_REQUEST', title: 'The request failed', detail: msg, stillValid: 'Nothing on this view is current until the request succeeds.', action: 'RETRY', tone: 'bad' };
  }
  if (!i.methodRun && !i.cell) return { kind: 'NO_RESULT', title: 'No result carries this run', detail: 'The method run id does not resolve to any stored evaluation.', stillValid: '', action: 'GO_TO_LATEST', tone: 'muted' };
  if (i.methodRun && i.methodRun.purpose !== 'LIVE') {
    return { kind: 'SHADOW', title: `${i.methodRun.purpose} evaluation`, detail: 'This run was produced by a bounded evaluation, not the live timeline; it never opened or closed an episode.',
      stillValid: 'The verdict and evidence are exact for that run and configuration.', action: 'NONE', tone: 'warn' };
  }
  if (i.catalogue && i.catalogue.capabilityState !== 'INSTALLED') {
    return { kind: 'UNSUPPORTED_METHOD', title: 'Method not installed in this build',
      detail: `${i.catalogue.method.id} (${i.catalogue.method.state}); ${i.catalogue.capabilityReason ?? 'no capability reason given'}.`,
      stillValid: 'Other gates of the same run are unaffected. A flag-only gate carries no evidence view.', action: 'NONE', tone: 'muted' };
  }
  const status = i.cell?.status ?? '';
  const gate = i.gate ?? i.cell?.key ?? '';
  if (i.tier === 'fusion' && SHORT_GATES.has(gate) && status === 'NOT_EVALUATED' && !i.cell?.reason) {
    return { kind: 'SHORT_TIER', title: 'Evaluated on the 1m–60m windows', detail: `${gate} is judged per short window; a fused row carries no verdict of its own for it.`,
      stillValid: 'The short windows of the same period hold this gate\'s runs and evidence; the fused verdict is unaffected.', action: 'NONE', tone: 'muted',
      link: i.loopId ? { label: `Open the 15m windows of ${i.loopId} ›`, href: `/cpm/evidence?loop=${encodeURIComponent(i.loopId)}&kind=15m` } : undefined };
  }
  if (status === 'DISABLED') return { kind: 'DISABLED', title: 'Gate disabled by configuration', detail: i.cell?.reason ?? 'The gate is switched off for this loop.', stillValid: 'The other gates were evaluated without it; fusion assessability is reduced.', action: 'NONE', tone: 'muted' };
  if (status === 'NOT_EVALUATED' || status === 'EXCLUDED' || status === 'INSUFFICIENT') {
    return { kind: 'NOT_EVALUATED', title: `${codeLabel(status)}: the engine looked and declined`, detail: i.cell?.reason ? `Reason: ${phrase(i.cell.reason)}.` : 'No reason recorded.',
      stillValid: 'This is a verdict, not missing data: the prerequisite it names must be met before the gate can evaluate.', action: 'NONE', tone: 'warn' };
  }
  const readiness = i.manifest?.readiness ?? 'NONE';
  if (readiness === 'EXPIRED') return { kind: 'EVIDENCE_EXPIRED', title: 'Evidence expired by retention', detail: 'The manifests are kept; the arrays were removed by the retention policy.',
    stillValid: 'The verdict and every scalar of this run remain valid; only the arrays are gone. Reconstruction rebuilds them under the same identity.', action: 'RECONSTRUCT', tone: 'warn' };
  if (readiness === 'FAILED') return { kind: 'EVIDENCE_EXPIRED', title: 'Evidence failed verification', detail: 'A chunk did not verify; the artifacts are not trusted.',
    stillValid: 'The verdict is unaffected. Reconstruction re-emits the artifacts.', action: 'RECONSTRUCT', tone: 'bad' };
  if (readiness === 'NONE') {
    // nothing is pending: the retention policy keeps arrays only for windows with a finding
    return { kind: 'NOT_RETAINED', title: 'Evidence not retained for this run',
      detail: 'The live path keeps the arrays only for windows with a finding; reconstruct them on request under the same identity.',
      stillValid: 'The verdict and every scalar of this run are valid; only the arrays were not kept.', action: 'RECONSTRUCT', tone: 'muted' };
  }
  if (readiness === 'PENDING' || readiness === 'PARTIAL') {
    return { kind: 'EVIDENCE_PENDING', title: 'Evidence still arriving',
      detail: `${i.manifest?.count ?? 0} artifact(s) declared; some chunks are not stored yet.`,
      stillValid: 'The verdict and scalars are valid; the arrays are not yet available.', action: 'RECONSTRUCT', tone: 'muted' };
  }
  return { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };
}

export const GateResultStatePanel: React.FC<{ state: GateState; onReconstruct?: () => void; onRetry?: () => void; onGoToLatest?: () => void; busy?: boolean }> =
  ({ state, onReconstruct, onRetry, onGoToLatest, busy }) => {
    const action =
      state.action === 'RECONSTRUCT' && onReconstruct ? { label: busy ? 'Reconstruction requested…' : 'Reconstruct evidence', onClick: onReconstruct }
      : state.action === 'RETRY' && onRetry ? { label: 'Retry', onClick: onRetry }
      : state.action === 'GO_TO_LATEST' && onGoToLatest ? { label: 'Go to the latest run', onClick: onGoToLatest }
      : undefined;
    return (
      <div className="cpm-gate-state" data-state={state.kind}>
        <TonePill tone={state.tone}>{codeLabel(state.kind)}</TonePill>
        <EmptyState title={state.title} copy={state.detail} action={action} />
        {state.stillValid && <p className="cpm-gate-state__valid">{state.stillValid}</p>}
        {state.link && <Link className="cpm-gate-state__link" to={state.link.href}>{state.link.label}</Link>}
        {state.action === 'RECONSTRUCT' && !onReconstruct && (
          <ObcButton variant="normal" disabled>Reconstruct evidence</ObcButton>
        )}
      </div>
    );
  };
