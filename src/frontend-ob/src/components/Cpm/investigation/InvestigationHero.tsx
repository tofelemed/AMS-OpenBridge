/**
 * CHG-141: the result card: this window's result, its cause and severity, three facts, and the next check. An older
 * verdict is named as older under the title, with its age, and never takes the title. `id="cpm-conclusion"` is what the
 * strip that keeps the result in view watches.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { Toggletip } from '../../../ui/Toggletip';
import { EvidenceScoreNote } from '../EvidenceScoreNote';
import { staleVerdictLine } from '../verdictAge';
import { codeLabel } from '../vocabulary';
import { windowSpan } from '../windowLabel';
import { causeOf, heroFacts, heroNextCheck, heroTitle, windowHeading } from './heroFacts';

const Fact: React.FC<{ label: string; value: string; help?: React.ReactNode }> = ({ label, value, help }) => (
  <div className="cpm-kpi cpm-kpi--muted">
    <span className="cpm-kpi__caption cpm-title-row">{label}{help}</span>
    {/* A word or a dash stands where a number would: the smaller size is the app's own for a value that is not a number. */}
    <span className="cpm-kpi__value">{/\d/.test(value) ? value : <span className="cpm-metric-na">{value}</span>}</span>
  </div>
);

export const InvestigationHero: React.FC<{
  matrix: CpmGateMatrix;
  /** The episode open at this window's end. */
  episode: Pick<CpmEventFrame, 'opened_at'> | null;
  latest: boolean;
  windowKind: string;
  timeZone?: string;
  onStart: () => void;
}> = ({ matrix, episode, latest, windowKind, timeZone, onStart }) => {
  const cause = causeOf(matrix);
  const older = staleVerdictLine(matrix.lastVerdict);
  return (
    <section className="cpm-surface cpm-inv-hero" id="cpm-conclusion" aria-label="Result of this window">
      <div className="cpm-inv-hero__top">
        <div className="cpm-inv-hero__result">
          <span className="cpm-eyebrow" title={windowSpan({ ...matrix, windowKind }, timeZone)}>{windowHeading(matrix, { latest, windowKind, timeZone })}</span>
          <h2 className="cpm-title">{heroTitle(matrix)}</h2>
          {older && <p className="cpm-copy" title={matrix.lastVerdict?.windowEnd ?? undefined}>{older.replace(/^l/, 'L')}</p>}
          <dl className="cpm-inv-hero__class">
            <div>
              <dt className="cpm-kv__label cpm-title-row">
                Cause
                <Toggletip variant="how-to" label="Symptom and cause">
                  <p>The title names what was observed. A valve, controller, process or instrument cause is a separate claim, shown here only when the engine qualified one.</p>
                </Toggletip>
              </dt>
              <dd>{cause.text}{cause.unconfirmed && <span className="cpm-metric-na"> · not confirmed</span>}</dd>
            </div>
            <div>
              <dt className="cpm-kv__label">Engine severity</dt>
              <dd>{codeLabel(matrix.severity)}</dd>
            </div>
          </dl>
        </div>
        <div className="cpm-inv-hero__facts">
          {heroFacts(matrix, episode).map(f => (
            <Fact key={f.label} label={f.label} value={f.value}
              help={f.label === 'Evidence score' ? <Toggletip variant="how-to" label="Evidence score"><EvidenceScoreNote /></Toggletip> : undefined} />
          ))}
        </div>
      </div>
      <div className="cpm-inv-hero__next" role="group" aria-label="Next check">
        <p className="cpm-inv-hero__check"><span className="cpm-eyebrow">Next check</span><strong>{heroNextCheck(matrix)}</strong></p>
        <ObcButton variant="flat" onClick={onStart}>Start with evidence ↓</ObcButton>
      </div>
    </section>
  );
};

export default InvestigationHero;
