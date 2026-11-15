/**
 * v2.5 Task 2E.4 - G15, the decision record in the argmax form fusion uses: a ranked list, not a waterfall. CHG-187 (owner
 * review 11.2): the decision (possible cause, case, open condition, availability, qualified support) is the gate's KPI cards,
 * so its rows went from here; the hypotheses are a table (rank · hypothesis · status · score · from which symptoms) in place of
 * one long sentence each; one sentence-case heading per section, the score note behind the hypotheses' ?. The engine trace
 * (raw codes) stays, closed, until the owner rules on it.
 */
import React from 'react';
import { Toggletip } from '../../../../ui/Toggletip';
import { DataTable, type Column } from '../../../../ui/DataTable';
import { StatusBadge } from '../../../../ui/StatusBadge';
import type { BadgeTone } from '../../../../ui/statusTones';
import { PanelHead } from '../../shared';
import { codeLabel, phrase } from '../../vocabulary';
import { CodeLabel } from '../../CodeLabel';
import { EngineTrace, parseExplanations, type Explanation } from './engineTrace';
import type { DecodedArtifact } from '../artifactCodec';
import { useGateArtifacts } from '../useGateArtifacts';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
import { RequireKinds, first } from './viewSupport';

const P = (d: DecodedArtifact | undefined, k: string) => d?.meta.provenance?.[k];
const list = (s: string | undefined) => (s ?? '').split(';').map(x => x.trim()).filter(Boolean);

export interface RankedHypothesis { id: string; state: string; score: number; groups: string }
export function rankedHypotheses(d: DecodedArtifact): RankedHypothesis[] {
  const groups = new Map(list(P(d, 'evidence_groups')).map(g => { const eq = g.indexOf('='); return [g.slice(0, eq), g.slice(eq + 1)]; }));
  return list(P(d, 'hypotheses')).map(h => { const [id, state, score] = h.split(':'); return { id, state, score: Number(score), groups: groups.get(id) ?? '' }; })
    .sort((a, b) => b.score - a.score);
}

/** The symptoms a hypothesis rests on, in words ("Sustained oscillation, actuator stress"). */
export function fromSymptoms(groups: string): string {
  const words = groups.split(',').map(g => g.trim()).filter(Boolean).map(g => phrase(g));
  if (words.length === 0) return '—';
  const text = words.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Colour only on the leading hypothesis (ISA-101): confirmed is a finding to act on, otherwise informational. */
const toneOf = (state: string, leading: boolean): BadgeTone => (!leading ? 'neutral' : state === 'CONFIRMED' ? 'warning' : 'info');
const score = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

interface Observation { id: string; present: string; score: number; role: string }

export const G15Body: React.FC<{ d: DecodedArtifact }> = ({ d }) => {
  const observations: Observation[] = list(P(d, 'observations')).map(o => { const [id, present, s, role] = o.split(':'); return { id, present, score: Number(s), role }; });
  const ranked = rankedHypotheses(d);
  const leading = P(d, 'leading_hypothesis');
  const explanations = parseExplanations(P(d, 'explanations'));
  const hypothesisColumns: Array<Column<RankedHypothesis>> = [
    { key: 'rank', header: 'Rank', cell: (_h, i) => i + 1 },
    { key: 'hypothesis', header: 'Hypothesis', cell: h => (
      <span className="cpm-hypo__name" data-leading={h.id === leading}>
        <CodeLabel code={h.id} />{h.id === leading && <span className="cpm-hypo__lead">Leading</span>}
      </span>
    ) },
    { key: 'status', header: 'Status', cell: h => <StatusBadge tone={toneOf(h.state, h.id === leading)}>{codeLabel(h.state)}</StatusBadge> },
    { key: 'score', header: 'Score', align: 'end', cell: h => score(h.score) },
    { key: 'from', header: 'From', cell: h => fromSymptoms(h.groups) },
  ];
  const observationColumns: Array<Column<Observation>> = [
    { key: 'symptom', header: 'Symptom', cell: o => <CodeLabel code={o.id} /> },
    { key: 'seen', header: 'Seen', cell: o => (o.present === 'PRESENT' ? 'Yes' : o.present === 'ABSENT' ? 'No' : codeLabel(o.present)) },
    { key: 'score', header: 'Score', align: 'end', cell: o => score(o.score) },
    { key: 'role', header: 'Role', cell: o => <CodeLabel code={o.role} /> },
  ];
  const explanationColumns: Array<Column<Explanation>> = [
    { key: 'symptom', header: 'Symptom', cell: e => <CodeLabel code={e.observation} /> },
    { key: 'gate', header: 'Gate', cell: e => e.gate },
    { key: 'result', header: 'Result', cell: e => <CodeLabel code={e.status} /> },
    { key: 'note', header: 'Note', cell: e => e.note || '—' },
  ];
  return (
    <section className="cpm-surface cpm-decision">
      <PanelHead title="Hypotheses" help={(
        <Toggletip variant="how-to" label="Hypotheses">
          <p>Ranked by evidence score: the highest leads, and the scores do not add up.</p>
          <p>{codeLabel(P(d, 'score_semantics') ?? 'EVIDENCE_SCORE_UNCALIBRATED')}.</p>
        </Toggletip>
      )} />
      <DataTable caption="Hypotheses" columns={hypothesisColumns} rows={ranked} rowKey={h => h.id} emptyTitle="No hypotheses recorded." />
      <PanelHead title="Symptoms observed" />
      <DataTable caption="Symptoms observed" columns={observationColumns} rows={observations} rowKey={o => o.id} emptyTitle="No symptoms recorded." />
      {explanations.length > 0 && (
        <>
          <PanelHead title="Which gate supplied each symptom" />
          <DataTable caption="Which gate supplied each symptom" columns={explanationColumns} rows={explanations} rowKey={e => e.observation} />
        </>
      )}
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
