/**
 * CHG-141: the result card: this window's result, its cause and severity, and three facts. An older verdict is named as
 * older under the title, with its age, and never takes the title. CHG-160 (owner review): the Result tab. The band names
 * the window, so the card says only when it is an earlier one; what the result rests on and the limits on it sit under the
 * facts; the next check leads the Review tab.
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { Toggletip } from '../../../ui/Toggletip';
import type { ConclusionBasis } from '../conclusionBasis';
import { isRerun } from '../evidence/useWindowAt';
import { EvidenceScoreNote } from '../EvidenceScoreNote';
import { TonePill } from '../shared';
import { staleVerdictLine } from '../verdictAge';
import { codeLabel } from '../vocabulary';
import { windowSpan } from '../windowLabel';
import type { ConclusionLimits } from './gateGroups';
import { causeOf, heroFacts, heroTitle } from './heroFacts';

const Fact: React.FC<{ label: string; value: string; help?: React.ReactNode }> = ({ label, value, help }) => (
  <div className="cpm-kpi cpm-kpi--muted">
    <span className="cpm-kpi__caption cpm-title-row">{label}{help}</span>
    {/* A word or a dash stands where a number would: the smaller size is the app's own for a value that is not a number. */}
    <span className="cpm-kpi__value">{/\d/.test(value) ? value : <span className="cpm-metric-na">{value}</span>}</span>
  </div>
);

export const InvestigationHero: React.FC<{
  matrix: CpmGateMatrix;
  /** The episode open at this window's end; null when none was, undefined when the episodes are unread. */
  episode: Pick<CpmEventFrame, 'opened_at'> | null | undefined;
  latest: boolean;
  windowKind: string;
  timeZone?: string;
  /** What the result rests on (CHG-064, SME #24), said once. */
  basis: ConclusionBasis | null;
  limits: ConclusionLimits;
}> = ({ matrix, episode, latest, windowKind, timeZone, basis, limits }) => {
  const cause = causeOf(matrix);
  const older = staleVerdictLine(matrix.lastVerdict);
  return (
    <section className="cpm-inv-hero" id="cpm-conclusion" aria-label="Result of this window">
      <div className="cpm-inv-hero__top">
        <div className="cpm-inv-hero__result">
          <div className="cpm-title-row">
            <h2 className="cpm-title">{heroTitle(matrix)}</h2>
            {!latest && <span title={windowSpan({ ...matrix, windowKind }, timeZone)}><TonePill tone="muted">Earlier window</TonePill></span>}
            {isRerun(matrix) && <TonePill tone="muted">Re-run, no original stored</TonePill>}
          </div>
          {older && <p className="cpm-copy" title={matrix.lastVerdict?.windowEnd ?? undefined}>{older.replace(/^l/, 'L')}</p>}
          {basis && <p className="cpm-copy"><strong>{basis.lead}</strong> {basis.from}.</p>}
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
      {limits.lines.length > 0 && (
        <div className="cpm-inv-limits">
          <h3 className="cpm-panel-title">{limits.title}</h3>
          <ul className="cpm-cause-list">{limits.lines.map(line => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
    </section>
  );
};

export default InvestigationHero;
