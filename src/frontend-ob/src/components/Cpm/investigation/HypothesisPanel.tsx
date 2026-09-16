/**
 * v2.5 Task 1E.2 (spec v6 R02) — the Investigation page's hypothesis comparison, rendered
 * from the SERVED fusion v2 verdict: mechanisms with their evidence for and against, the
 * fault-scoped G14 confirmation, and the observations with the method that produced each.
 * Nothing here scores, ranks or caps anything; the engine did. A pre-v2.5 row is shown as
 * stored family scores under a LEGACY pill and is never re-interpreted.
 */
import React from 'react';
import type { CpmVerdictV2 } from '../../../api/cpm/verdict';
import { HYPOTHESIS_LABEL, HYPOTHESIS_ORDER, OBSERVATION_LABEL } from '../../../api/cpm/verdict';
import { EmptyState, KvRow, PanelHead, TonePill } from '../shared';
import type { CpmTone } from '../shared';
import { confirmationLabel, confirmationProse } from './confirmationCopy';
import { fmt } from './keyFacts';

/** Family / detector scores for the LEGACY fallback (rows written before v2.5). */
const LEGACY_ROWS: { field: string; label: string }[] = [
  { field: 'stiction_family_score', label: 'Stiction family' },
  { field: 'effort_family_score', label: 'Actuator effort' },
  { field: 'fft_score', label: 'Spectral (FFT)' },
  { field: 'corner_score', label: 'Phase-portrait corners' },
  { field: 'acf_regularity', label: 'ACF regularity' },
  { field: 'raw_final_element_score', label: 'Weighted final-element' },
];

const stateTone = (state: string): CpmTone =>
  state === 'QUALIFIED' ? 'warn' : state === 'DISQUALIFIED' ? 'muted' : 'muted';

const confirmationTone = (state: string): CpmTone =>
  state === 'CONFIRMED' ? 'bad' : state === 'CONTRADICTED' ? 'good' : 'muted';

const ScoreBar: React.FC<{ value: number }> = ({ value }) => (
  <span className="cpm-hypo">
    <span className="cpm-hypo__track">
      <span
        className={`cpm-hypo__fill${value >= 0.7 ? ' cpm-hypo__fill--high' : ''}`}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </span>
    <span className="cpm-mono">{fmt(value)}</span>
  </span>
);

export const HypothesisPanel: React.FC<{
  verdict: CpmVerdictV2 | undefined;
  /** All numeric payload fields — the legacy fallback reads the stored family scores from here. */
  metrics: Record<string, number>;
}> = ({ verdict, metrics }) => {
  if (!verdict || verdict.legacy) {
    const rows = LEGACY_ROWS.map(h => ({ ...h, value: metrics[h.field] })).filter(h => h.value != null);
    return (
      <>
        <PanelHead eyebrow="Hypothesis comparison" title="Family and detector scores"
          right={<TonePill tone="muted">LEGACY</TonePill>} />
        <p className="cpm-copy">
          This result predates v2.5: it carries family scores but no observations, hypotheses or
          fault-scoped confirmation. {confirmationProse(undefined, true)}
        </p>
        {rows.length === 0 && (
          <EmptyState title="No family scores on this window"
            copy="Scores are produced by the long-diagnostics tier; short-only windows carry none." />
        )}
        {rows.map(h => (
          <div key={h.field} className="cpm-kv">
            <span className="cpm-kv__label">{h.label}</span>
            <span className="cpm-kv__value"><ScoreBar value={h.value!} /></span>
          </div>
        ))}
      </>
    );
  }

  const ids = [
    ...HYPOTHESIS_ORDER.filter(id => verdict.hypotheses[id]),
    ...Object.keys(verdict.hypotheses).filter(id => !HYPOTHESIS_ORDER.includes(id)),
  ];
  const conf = verdict.confirmation;
  const observations = Object.entries(verdict.observations);

  return (
    <>
      <PanelHead eyebrow="Hypothesis comparison" title="Mechanisms and the evidence for each"
        right={<TonePill tone="muted">revision {verdict.resultRevision}</TonePill>} />
      {ids.length === 0 && <EmptyState title="No hypotheses on this window" />}
      {ids.map(id => {
        const h = verdict.hypotheses[id];
        const leading = verdict.leadingHypothesis === id;
        return (
          <div key={id} className="cpm-window-row" data-testid={`hypothesis-${id}`}>
            <strong>
              {HYPOTHESIS_LABEL[id] ?? id}{' '}
              <TonePill tone={stateTone(h.state)}>{h.state.replace(/_/g, ' ')}</TonePill>
              {leading && <> <TonePill tone="warn">LEADING</TonePill></>}
            </strong>
            <ScoreBar value={h.score} />
            <span className="cpm-event-row__sub">
              {h.evidenceGroups.length > 0
                ? `for: ${h.evidenceGroups.map(g => OBSERVATION_LABEL[g] ?? g).join(' · ')}`
                : 'no supporting observation'}
              {h.contradictions.length > 0 && ` · against: ${h.contradictions.join(', ')}`}
              {h.disqualifiers.length > 0 && ` · disqualified: ${h.disqualifiers.join(', ')}`}
            </span>
          </div>
        );
      })}
      <p className="cpm-copy">
        Scores are uncalibrated evidence scores ({verdict.scoreSemantics}), not probabilities.
      </p>

      <PanelHead eyebrow="G14 confirmation" title={conf.claimType.replace(/_/g, ' ')}
        right={<TonePill tone={confirmationTone(conf.state)}>{confirmationLabel(conf)}</TonePill>} />
      <p className="cpm-copy" data-testid="confirmation-prose">{confirmationProse(conf)}</p>
      {conf.positiveEvidenceIds.length > 0 && (
        <KvRow label="Positive evidence">{conf.positiveEvidenceIds.join(', ')}</KvRow>
      )}
      {conf.contradictions.length > 0 && (
        <KvRow label="Contradictions">{conf.contradictions.join(', ')}</KvRow>
      )}
      {conf.scope && <KvRow label="Scope">{conf.scope}</KvRow>}

      {observations.length > 0 && (
        <>
          <PanelHead eyebrow="Observations" title="What was seen, and by which method" />
          <div className="cpm-matrix-scroll">
            <table className="cpm-matrix">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Observation</th>
                  <th>Present</th>
                  <th>Score</th>
                  <th style={{ textAlign: 'left' }}>Method</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {observations.map(([id, o]) => (
                  <tr key={id} data-testid={`observation-${id}`}>
                    <td style={{ textAlign: 'left' }}>{OBSERVATION_LABEL[id] ?? id}</td>
                    <td>{o.present ? 'yes' : '—'}</td>
                    <td className="cpm-mono">{fmt(o.score)}</td>
                    <td style={{ textAlign: 'left' }}><span className="cpm-mono">{o.methodId}</span></td>
                    <td>{o.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

export default HypothesisPanel;
