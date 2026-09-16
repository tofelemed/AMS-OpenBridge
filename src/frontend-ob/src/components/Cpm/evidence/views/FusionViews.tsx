/**
 * v2.5 Task 2E.4 - the fusion-tier views: G12 (link to the response workspace + the run's own
 * artifacts), G13 (the capability record: UNSUPPORTED_METHOD with its reason - never a picture of
 * an uncomputed method), G14 (the confirmation record: claim, positive evidence, contradictions,
 * scope; no numeric certainty curve), G15 (the decision record in the argmax form fusion uses -
 * a ranked list, not a waterfall).
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill } from '../../shared';
import type { DecodedArtifact } from '../artifactCodec';
import { useGateArtifacts } from '../useGateArtifacts';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
import { GateResultStatePanel } from '../GateResultState';
import { RequireKinds, first } from './viewSupport';
import { formatInZone } from '../timezone';

const P = (d: DecodedArtifact | undefined, k: string) => d?.meta.provenance?.[k];
const list = (s: string | undefined) => (s ?? '').split(';').map(x => x.trim()).filter(Boolean);

// ── G12 ────────────────────────────────────────────────────────────────────────────────────────
export const G12Response: React.FC<GateViewProps> = ({ manifest }) => {
  const runId = manifest.methodRunId;
  const loopId = manifest.artifacts[0]?.provenance?.loop_id;
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G12" title="System response" />
      <p className="cpm-copy">
        G12 is event-keyed: its evidence (accepted samples, input reconstruction, fit, holdout prediction, residuals, candidate models, delay objective curve, parameter intervals, Bode where valid) belongs to a response event, not a window. Open the response workspace for the event; the artifacts of this run are listed below by the generic renderer.
      </p>
      <ObcButton variant="raised" onClick={() => { window.location.assign(`/cpm/response?loop=${encodeURIComponent(loopId ?? '')}&methodRun=${encodeURIComponent(runId)}`); }}>
        Open in System Response ›
      </ObcButton>
    </section>
  );
};

// ── G13 ────────────────────────────────────────────────────────────────────────────────────────
export const G13Body: React.FC<{ d: DecodedArtifact | undefined }> = ({ d }) => (
  <GateResultStatePanel state={{
    kind: 'UNSUPPORTED_METHOD', title: 'Interaction analysis not installed in this build',
    detail: `${P(d, 'capability_reason') ?? 'INTERACTION_METHOD_NOT_INSTALLED'} — legacy link flag: ${P(d, 'legacy_link_flag') ?? '—'}. Aligned peer series, cross-correlation, coherence and lag are ${P(d, 'aligned_series') ?? 'UNAVAILABLE'}.`,
    stillValid: 'A configured link is not a verdict: an unmapped or uncomputed peer neither proves nor rules out a disturbance. The other gates of this run are unaffected.',
    action: 'NONE', tone: 'muted',
  }} />
);
export const G13Interaction: React.FC<GateViewProps> = ({ manifest, gate }) => {
  const arts = useGateArtifacts(manifest, gate);
  return <G13Body d={first(arts, 'interaction')} />;
};

// ── G14 ────────────────────────────────────────────────────────────────────────────────────────
export const G14Body: React.FC<{ d: DecodedArtifact; timeZone: string }> = ({ d, timeZone }) => {
  const positive = list(P(d, 'positive_evidence_ids'));
  const contradictions = list(P(d, 'contradictions'));
  const confirmedAt = P(d, 'confirmed_at');
  const state = P(d, 'state') ?? '—';
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G14" title="Final-element confirmation" right={<TonePill tone={state === 'CONFIRMED' ? 'bad' : state === 'SUSPECTED' ? 'warn' : 'muted'}>{state}</TonePill>} />
      <KvRow label="claim_type">{P(d, 'claim_type') ?? '—'}</KvRow>
      <KvRow label="scope">{P(d, 'scope') ?? '—'} — the confirmed subtype cannot exceed this scope</KvRow>
      <KvRow label="reason">{P(d, 'reason') || '—'}</KvRow>
      <KvRow label="source_validity">{P(d, 'source_validity') ?? '—'}</KvRow>
      <KvRow label="confirmed_at">{confirmedAt && confirmedAt !== 'NOT_CONFIRMED' && Number.isFinite(Number(confirmedAt)) ? formatInZone(Number(confirmedAt), timeZone) : confirmedAt ?? '—'}</KvRow>
      <KvRow label="non_following_dwell_s">{P(d, 'non_following_dwell_s') ?? '—'}</KvRow>
      <table className="cpm-table" data-table="evidence">
        <thead><tr><th>Positive evidence (non-following records)</th><th>Contradictions (healthy tracking)</th></tr></thead>
        <tbody>
          {Array.from({ length: Math.max(positive.length, contradictions.length, 1) }, (_, i) => (
            <tr key={i}><td>{positive[i] ?? (i === 0 ? 'none — no positive non-following record' : '')}</td><td>{contradictions[i] ?? (i === 0 ? 'none' : '')}</td></tr>
          ))}
        </tbody>
      </table>
      <KvRow label="test_id / review_record">{P(d, 'test_id') ?? 'NONE'} / {P(d, 'review_record') ?? 'NONE'}</KvRow>
      <p className="cpm-copy">Confirmation is a claim scoped to its evidence: healthy tracking contradicts non-following, and no numeric certainty curve is drawn.</p>
    </section>
  );
};
export const G14Confirmation: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'confirmation_record');
  return <RequireKinds arts={arts} kinds={['confirmation_record']}>{d && <G14Body d={d} timeZone={timeZone} />}</RequireKinds>;
};

// ── G15 ────────────────────────────────────────────────────────────────────────────────────────
export interface RankedHypothesis { id: string; state: string; score: number; groups: string }
export function rankedHypotheses(d: DecodedArtifact): RankedHypothesis[] {
  const groups = new Map(list(P(d, 'evidence_groups')).map(g => { const eq = g.indexOf('='); return [g.slice(0, eq), g.slice(eq + 1)]; }));
  return list(P(d, 'hypotheses')).map(h => { const [id, state, score] = h.split(':'); return { id, state, score: Number(score), groups: groups.get(id) ?? '' }; })
    .sort((a, b) => b.score - a.score);
}
export const G15Body: React.FC<{ d: DecodedArtifact }> = ({ d }) => {
  const observations = list(P(d, 'observations')).map(o => { const [id, present, score, role] = o.split(':'); return { id, present, score, role }; });
  const ranked = rankedHypotheses(d);
  const leading = P(d, 'leading_hypothesis');
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G15" title="Decision" right={<TonePill tone="muted">{P(d, 'score_semantics') ?? 'EVIDENCE_SCORE_UNCALIBRATED'}</TonePill>} />
      <KvRow label="case_state">{P(d, 'case_state') ?? '—'} · condition {P(d, 'condition_state') ?? '—'} · availability {P(d, 'availability') ?? '—'} · revision {P(d, 'result_revision') ?? '—'}</KvRow>
      <KvRow label="qualified_support">{P(d, 'qualified_support') ?? '—'} ms</KvRow>
      <PanelHead eyebrow="Hypotheses" title={`Ranked by evidence score (${P(d, 'selection_rule') ?? 'argmax'}) — not an additive waterfall`} />
      <ol className="cpm-ranked" data-list="hypotheses">
        {ranked.map(h => (
          <li key={h.id} data-leading={h.id === leading}>
            <TonePill tone={h.id === leading ? (h.state === 'CONFIRMED' ? 'bad' : 'warn') : 'muted'}>{h.state}</TonePill> {h.id} — evidence score {h.score.toFixed(2)}{h.groups ? ` (${h.groups})` : ''}{h.id === leading ? ' · leading' : ''}
          </li>
        ))}
        {ranked.length === 0 && <li>No hypotheses recorded.</li>}
      </ol>
      <PanelHead eyebrow="Observations" title="Symptoms as observed" />
      <table className="cpm-table" data-table="observations">
        <thead><tr><th>observation</th><th>present</th><th>score</th><th>role</th></tr></thead>
        <tbody>{observations.map(o => <tr key={o.id}><td>{o.id}</td><td>{o.present}</td><td>{o.score}</td><td>{o.role}</td></tr>)}</tbody>
      </table>
      <KvRow label="explanations">{P(d, 'explanations') || '—'}</KvRow>
      <p className="cpm-copy">Missing evidence does not close a condition; a disabled gate reduces assessability rather than proving health.</p>
    </section>
  );
};
export const G15Decision: React.FC<GateViewProps> = ({ manifest, gate }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'decision_record');
  return <RequireKinds arts={arts} kinds={['decision_record']}>{d && <G15Body d={d} />}</RequireKinds>;
};
