'use client';

/**
 * Explorer › Summary: the selected gate of the latest fused window — the served
 * cell first (status, reason, window, samples, role, what the gate asks), then
 * that gate's evidence rendered with the Workbench's own gate view.
 *
 * Loaded lazily and only on an explicit gate selection; it is the only part of
 * the Summary that fetches beyond the cached row (gate catalogue, then the run's
 * manifest and artifacts when the row carries run identity). What stays in the
 * Workbench: the explain column, signal-context lanes, reconstruction, compare
 * and the window picker — the Workbench button below opens the exact run.
 */
import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ReasonedButton } from '../../ReasonedButton';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';
import { useGateCatalogue } from '../../../../hooks/useCpm';
import { KvRow, PanelHead, TonePill, fmtDateTime } from '../../shared';
import { gateTone } from '../../gateStatus';
import { performanceHref, replayHref } from '../../cpaHref';
import { workbenchHref } from '../../evidence/selection';
import { useEvidenceManifest } from '../../evidence/useEvidence';
import { useGateArtifacts } from '../../evidence/useGateArtifacts';
import { EvidenceArtifactRenderer } from '../../evidence/EvidenceArtifactRenderer';
import { GateResultStatePanel, classifyGateResult, type GateState } from '../../evidence/GateResultState';
import { headlineOf } from '../../evidence/views/headlines';
import { verdictSentence } from '../../evidence/verdictCopy';
import { formatInZone, siteZoneOf } from '../../evidence/timezone';
import { codeLabel } from '../../vocabulary';

export interface SummaryGateDetailProps {
  loop: CpmLoop;
  gate: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  onClose: () => void;
}

/** A served row written before v2.5 carries no run identity: the cell is the whole evidence. */
const LEGACY_STATE: GateState = {
  kind: 'NOT_RETAINED',
  title: 'No evidence arrays for this row',
  detail: 'This result predates run identity (v2.5); the status and reason above are the served verdict.',
  stillValid: 'Evidence Replay can rebuild the raw signals of the same window from the historian.',
  action: 'NONE',
  tone: 'muted',
};

export const SummaryGateDetail: React.FC<SummaryGateDetailProps> = ({ loop, gate, matrix, windowKind, onClose }) => {
  const navigate = useNavigate();
  const cell = matrix.gates.find(g => g.key === gate);
  const runId = cell?.methodRunId ?? matrix.methodRunIds?.[gate] ?? null;
  const timeZone = siteZoneOf(loop);
  const timeFmt = useCallback((ms: number) => formatInZone(ms, timeZone), [timeZone]);

  const catalogue = useGateCatalogue();
  const entry = catalogue.data?.gates.find(g => g.gate === gate);
  const manifest = useEvidenceManifest(runId ?? undefined, 15_000);

  const state: GateState = useMemo(() => {
    if (!runId) return LEGACY_STATE;
    return classifyGateResult({
      loading: manifest.isLoading,
      error: manifest.error ?? null,
      cell: cell ? { key: cell.key, status: cell.status, reason: cell.reason } : null,
      catalogue: entry ? { capabilityState: entry.capabilityState, capabilityReason: entry.capabilityReason, method: entry.method } : null,
      manifest: manifest.data ? { readiness: manifest.data.readiness, count: manifest.data.count } : null,
      // gates/latest serves the live timeline; a bounded (shadow) run never lands here
      methodRun: { purpose: 'LIVE' },
      tier: 'fusion', gate, loopId: loop.loopId,
    });
  }, [runId, manifest.isLoading, manifest.error, manifest.data, cell, entry, gate, loop.loopId]);

  const arts = useGateArtifacts(state.kind === 'READY' ? manifest.data : undefined, gate);
  const headline = useMemo(() => (state.kind === 'READY' ? headlineOf(gate, arts) : []), [state.kind, gate, arts]);
  const name = entry?.name ?? cell?.name ?? gate;
  const status = cell?.status ?? null;
  const sentence = verdictSentence({
    gate, name, status, reason: cell?.reason ?? null, headline,
    eligibilityDetail: matrix.methodEligibility?.[gate]?.detail ?? null,
  });
  const tone = status ? gateTone(status, gate) : 'muted';

  return (
    <section className={`cpm-summary-detail cpm-tone-${tone}`} aria-label={`${gate} on the latest ${windowKind} window`}>
      <PanelHead
        eyebrow={`Evaluated ${windowKind} window${matrix.windowEnd ? ` · ending ${fmtDateTime(matrix.windowEnd)}` : ''}`}
        title={`${gate} · ${name}`}
        right={
          <span className="cpm-filter-row">
            {status && <TonePill tone={tone}>{codeLabel(status)}</TonePill>}
            <ObcButton variant="flat" title="Collapse this gate" onClick={onClose}>Close</ObcButton>
          </span>
        }
      />
      <p className="cpm-verdict__sentence">{sentence}</p>

      <div className="cpm-grid-2">
        <div>
          <KvRow label="Window from">{matrix.windowStart ? fmtDateTime(matrix.windowStart) : '—'}</KvRow>
          <KvRow label="Window to">{matrix.windowEnd ? fmtDateTime(matrix.windowEnd) : '—'}</KvRow>
          <KvRow label="Samples">{matrix.sampleCount ?? '—'}</KvRow>
          <KvRow label="Gate role">{entry?.role ?? (catalogue.isLoading ? 'Loading…' : '—')}</KvRow>
        </div>
        <div className="cpm-summary-detail__prose">
          <KvRow label="What this gate asks">{entry?.definition ?? (catalogue.isLoading ? 'Loading…' : '—')}</KvRow>
          <KvRow label="Preconditions">{entry?.preconditions ?? '—'}</KvRow>
          <KvRow label="Method">{entry ? `${entry.method.id} ${entry.method.version}` : '—'}</KvRow>
        </div>
      </div>

      {state.kind === 'READY' && manifest.data ? (
        <EvidenceArtifactRenderer gate={gate} manifest={manifest.data} timeZone={timeZone} timeFmt={timeFmt}
          onNavigateGate={g => { const id = matrix.methodRunIds?.[g]; if (id) navigate(workbenchHref(loop.loopId, id, g)); }} />
      ) : state.kind === 'LOADING' ? (
        <div className="cpm-surface cpm-skeleton cpm-skeleton--evidence" role="status" aria-busy="true" aria-label="Loading the evidence">
          <span className="cpm-skeleton__label">Loading the evidence for {gate}…</span>
        </div>
      ) : (
        <GateResultStatePanel state={state} onRetry={() => void manifest.refetch()} />
      )}

      <div className="cpm-inspector__actions">
        {/* CHG-098 (SME review 2 #29): the reason it is disabled is on screen, with the next step (Replay, beside it). */}
        <span title={runId ? `Open method run ${runId} in the Evidence Workbench` : undefined}>
          <ReasonedButton variant="raised" disabled={!runId}
            reason="Stored before analysis runs were kept (before v2.5), so there is no run to open — use Replay"
            onClick={() => { if (runId) navigate(workbenchHref(loop.loopId, runId, gate)); }}>
            Open in Evidence Workbench ›
          </ReasonedButton>
        </span>
        <ObcButton variant="normal" title={`Replay the ${windowKind} window from the historian`}
          onClick={() => navigate(replayHref(loop.loopId, { gate, window: matrix.windowEnd, kind: windowKind }))}>
          Evidence Replay ›
        </ObcButton>
        <ObcButton variant="normal" title="This gate in the fleet matrix, with the docked evidence panel"
          onClick={() => navigate(performanceHref({ loop: loop.loopId, gate, kind: windowKind }))}>
          Gate on Performance ›
        </ObcButton>
      </div>
    </section>
  );
};

export default SummaryGateDetail;
