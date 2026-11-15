/**
 * v2.5 Task 2E.4 - the fusion-tier views: G12 (link to the response workspace + the run's own
 * artifacts), G14 (the confirmation record: claim, positive evidence, contradictions, scope; no
 * numeric certainty curve). G13 (the aligned peer analysis, 2F.1) lives in G13Interaction.tsx, G15 (the decision) in
 * G15Decision.tsx. CHG-187 (owner review 11.2): no eyebrows; G14's decision (state, claim, reason, scope, non-following dwell)
 * is the gate's KPI cards, so the record here keeps only what the cards do not say, and its closing note is the state card's tip.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Toggletip } from '../../../../ui/Toggletip';
import { responseHref } from '../../cpaHref';
import { KvRow, PanelHead } from '../../shared';
import { codeLabel } from '../../vocabulary';
import { CodeLabel } from '../../CodeLabel';
import type { DecodedArtifact } from '../artifactCodec';
import { useGateArtifacts } from '../useGateArtifacts';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
import { RequireKinds, first } from './viewSupport';
import { formatInZone } from '../timezone';

const P = (d: DecodedArtifact | undefined, k: string) => d?.meta.provenance?.[k];
const list = (s: string | undefined) => (s ?? '').split(';').map(x => x.trim()).filter(Boolean);

// ── G12 ────────────────────────────────────────────────────────────────────────────────────────
export const G12Response: React.FC<GateViewProps> = ({ manifest }) => {
  const navigate = useNavigate();
  const runId = manifest.methodRunId;
  const loopId = manifest.artifacts[0]?.provenance?.loop_id;
  return (
    <section className="cpm-surface">
      <PanelHead title="System response"
        help={(
          <Toggletip variant="how-to" label="About the G12 evidence">
            <p>G12 is event-keyed: its evidence (accepted samples, input reconstruction, fit, holdout prediction, residuals, candidate models, delay objective curve, parameter intervals, Bode where valid) belongs to a response event, not a window.</p>
            <p>The artifacts of this run are listed below by the generic renderer.</p>
          </Toggletip>
        )} />
      {loopId && (
        <ObcButton variant="raised" onClick={() => navigate(responseHref(loopId, { methodRun: runId }))}>
          Open in System Response {'→'}
        </ObcButton>
      )}
    </section>
  );
};

// ── G14 ────────────────────────────────────────────────────────────────────────────────────────
export const G14Body: React.FC<{ d: DecodedArtifact; timeZone: string }> = ({ d, timeZone }) => {
  const positive = list(P(d, 'positive_evidence_ids'));
  const contradictions = list(P(d, 'contradictions'));
  const confirmedAt = P(d, 'confirmed_at');
  return (
    <section className="cpm-surface">
      <PanelHead title="Confirmation evidence" />
      <KvRow label="Source validity"><CodeLabel code={P(d, 'source_validity')} /></KvRow>
      <KvRow label="Confirmed at">{confirmedAt && confirmedAt !== 'NOT_CONFIRMED' && Number.isFinite(Number(confirmedAt)) ? formatInZone(Number(confirmedAt), timeZone) : codeLabel(confirmedAt)}</KvRow>
      <table className="cpm-table" data-table="evidence">
        <thead><tr><th>Positive evidence (non-following records)</th><th>Contradictions (healthy tracking)</th></tr></thead>
        <tbody>
          {Array.from({ length: Math.max(positive.length, contradictions.length, 1) }, (_, i) => (
            <tr key={i}><td>{positive[i] ?? (i === 0 ? 'none — no positive non-following record' : '')}</td><td>{contradictions[i] ?? (i === 0 ? 'none' : '')}</td></tr>
          ))}
        </tbody>
      </table>
      <KvRow label="Step test / review record">{P(d, 'test_id') ?? 'none'} / {P(d, 'review_record') ?? 'none'}</KvRow>
    </section>
  );
};
export const G14Confirmation: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'confirmation_record');
  return <RequireKinds arts={arts} kinds={['confirmation_record']}>{d && <G14Body d={d} timeZone={timeZone} />}</RequireKinds>;
};

export { G15Body, G15Decision, rankedHypotheses, type RankedHypothesis } from './G15Decision';
