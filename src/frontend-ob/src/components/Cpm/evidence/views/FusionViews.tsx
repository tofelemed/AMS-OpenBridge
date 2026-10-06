/**
 * v2.5 Task 2E.4 - the fusion-tier views: G12 (link to the response workspace + the run's own
 * artifacts), G14 (the confirmation record: claim, positive evidence, contradictions, scope; no
 * numeric certainty curve), G15 (the decision record in the argmax form fusion uses - a ranked
 * list, not a waterfall). G13 (the aligned peer analysis, 2F.1) lives in G13Interaction.tsx.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill, fmtDuration } from '../../shared';
import { codeLabel, phrase } from '../../vocabulary';
import { CodeLabel } from '../../CodeLabel';
import { EngineTrace, parseExplanations } from './engineTrace';
import type { DecodedArtifact } from '../artifactCodec';
import { useGateArtifacts } from '../useGateArtifacts';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
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

// ── G14 ────────────────────────────────────────────────────────────────────────────────────────
export const G14Body: React.FC<{ d: DecodedArtifact; timeZone: string }> = ({ d, timeZone }) => {
  const positive = list(P(d, 'positive_evidence_ids'));
  const contradictions = list(P(d, 'contradictions'));
  const confirmedAt = P(d, 'confirmed_at');
  const state = P(d, 'state') ?? '—';
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G14" title="Valve confirmation" right={<TonePill tone={state === 'CONFIRMED' ? 'bad' : state === 'SUSPECTED' ? 'warn' : 'muted'}><CodeLabel code={state} /></TonePill>} />
      <KvRow label="Claim"><CodeLabel code={P(d, 'claim_type')} /></KvRow>
      <KvRow label="Scope">{P(d, 'scope') ?? '—'} — the confirmed subtype cannot exceed this scope</KvRow>
      <KvRow label="Reason"><CodeLabel code={P(d, 'reason') || null} /></KvRow>
      <KvRow label="Source validity"><CodeLabel code={P(d, 'source_validity')} /></KvRow>
      <KvRow label="Confirmed at">{confirmedAt && confirmedAt !== 'NOT_CONFIRMED' && Number.isFinite(Number(confirmedAt)) ? formatInZone(Number(confirmedAt), timeZone) : codeLabel(confirmedAt)}</KvRow>
      <KvRow label="Non-following dwell">{Number.isFinite(Number(P(d, 'non_following_dwell_s'))) && P(d, 'non_following_dwell_s') != null ? fmtDuration(Number(P(d, 'non_following_dwell_s')) * 1000) : '—'}</KvRow>
      <table className="cpm-table" data-table="evidence">
        <thead><tr><th>Positive evidence (non-following records)</th><th>Contradictions (healthy tracking)</th></tr></thead>
        <tbody>
          {Array.from({ length: Math.max(positive.length, contradictions.length, 1) }, (_, i) => (
            <tr key={i}><td>{positive[i] ?? (i === 0 ? 'none — no positive non-following record' : '')}</td><td>{contradictions[i] ?? (i === 0 ? 'none' : '')}</td></tr>
          ))}
        </tbody>
      </table>
      <KvRow label="Step test / review record">{P(d, 'test_id') ?? 'none'} / {P(d, 'review_record') ?? 'none'}</KvRow>
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
  const observations = list(P(d, 'observations')).map(o => { const [id, present, score, role] = o.split(':'); return { id, present, score: Number(score), role }; });
  const ranked = rankedHypotheses(d);
  const leading = P(d, 'leading_hypothesis');
  const explanations = parseExplanations(P(d, 'explanations'));
  const supportMs = Number(P(d, 'qualified_support'));
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G15" title="Decision" right={<TonePill tone="muted"><CodeLabel code={P(d, 'score_semantics') ?? 'EVIDENCE_SCORE_UNCALIBRATED'} /></TonePill>} />
      <KvRow label="Possible cause"><CodeLabel code={leading} />{leading && leading !== 'NONE' ? ' — the leading explanation, not confirmed' : ''}</KvRow>
      <KvRow label="Case"><CodeLabel code={P(d, 'case_state')} kind="diagnosis" /></KvRow>
      <KvRow label="Open condition"><CodeLabel code={P(d, 'condition_state')} /></KvRow>
      <KvRow label="Availability"><CodeLabel code={P(d, 'availability')} /></KvRow>
      {/* SME #15: the qualified support was printed in raw milliseconds */}
      <KvRow label="Qualified support">{Number.isFinite(supportMs) && P(d, 'qualified_support') != null ? fmtDuration(supportMs) : '—'}</KvRow>
      <PanelHead eyebrow="Hypotheses" title="Ranked by evidence score — the highest leads; scores do not add up" />
      <ol className="cpm-ranked" data-list="hypotheses">
        {ranked.map(h => (
          <li key={h.id} data-leading={h.id === leading}>
            <TonePill tone={h.id === leading ? (h.state === 'CONFIRMED' ? 'bad' : 'warn') : 'muted'}><CodeLabel code={h.state} /></TonePill>{' '}
            <CodeLabel code={h.id} /> — evidence score {Number.isFinite(h.score) ? h.score.toFixed(2) : '—'}
            {h.groups ? ` (from ${h.groups.split(',').map(g => phrase(g.trim())).join(', ')})` : ''}{h.id === leading ? ' · leading' : ''}
          </li>
        ))}
        {ranked.length === 0 && <li>No hypotheses recorded.</li>}
      </ol>
      <PanelHead eyebrow="Observations" title="Symptoms as observed" />
      <table className="cpm-table" data-table="observations">
        <thead><tr><th>Symptom</th><th>Seen</th><th>Score</th><th>Role</th></tr></thead>
        <tbody>{observations.map(o => (
          <tr key={o.id}><td><CodeLabel code={o.id} /></td><td>{o.present === 'PRESENT' ? 'yes' : o.present === 'ABSENT' ? 'no' : codeLabel(o.present)}</td>
            <td>{Number.isFinite(o.score) ? o.score.toFixed(2) : '—'}</td><td><CodeLabel code={o.role} /></td></tr>
        ))}</tbody>
      </table>
      {explanations.length > 0 && (
        <>
          <PanelHead eyebrow="Why" title="Which gate supplied each symptom" />
          <table className="cpm-table" data-table="explanations">
            <thead><tr><th>Symptom</th><th>Gate</th><th>Result</th><th>Note</th></tr></thead>
            <tbody>{explanations.map(e => (
              <tr key={e.observation}><td><CodeLabel code={e.observation} /></td><td>{e.gate}</td><td><CodeLabel code={e.status} /></td><td>{e.note}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
      <p className="cpm-copy">Missing evidence does not close a condition; a disabled gate reduces assessability rather than proving health.</p>
      <EngineTrace entries={[['explanations', P(d, 'explanations')], ['selection_rule', P(d, 'selection_rule')], ['hypotheses', P(d, 'hypotheses')],
        ['observations', P(d, 'observations')], ['qualified_support (ms)', P(d, 'qualified_support')], ['result_revision', P(d, 'result_revision')]]} />
    </section>
  );
};
export const G15Decision: React.FC<GateViewProps> = ({ manifest, gate }) => {
  const arts = useGateArtifacts(manifest, gate);
  const d = first(arts, 'decision_record');
  return <RequireKinds arts={arts} kinds={['decision_record']}>{d && <G15Body d={d} />}</RequireKinds>;
};
