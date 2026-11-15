/**
 * CHG-141: the result card: this window's result, its cause and severity, and three facts. An older verdict is named as
 * older under the title, with its age, and never takes the title. CHG-160 (owner review): the Result tab. The band names
 * the window, so the card says only when it is an earlier one; what the result rests on and the limits on it sit under the
 * facts; the next check leads the Review tab.
 *
 * CHG-186 (owner review item 8, `08-result-tab-DESIGN`): left, the result with its dot, what confirmed it as chips (the
 * observation and its gate codes) and one card for cause and engine severity; right, the three facts as tiles; below, each
 * thing still unconfirmed as a card with its title and reason. Every fact of the earlier card has its place here.
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Toggletip } from '../../../ui/Toggletip';
import type { ConclusionBasis } from '../conclusionBasis';
import { isRerun } from '../evidence/useWindowAt';
import { EvidenceScoreNote } from '../EvidenceScoreNote';
import { conditionOf } from '../explorer/summary/summaryText';
import { KpiCard } from '../kpi/KpiCard';
import { TonePill, toneFor } from '../shared';
import { staleVerdictLine } from '../verdictAge';
import { codeLabel } from '../vocabulary';
import { windowSpan } from '../windowLabel';
import type { ConclusionLimits } from './gateGroups';
import { causeOf, heroFacts, heroTitle, limitCard } from './heroFacts';

/** What the result rests on: a chip per observation seen, each with its gate codes; a phrase when there is no list. */
const Basis: React.FC<{ basis: ConclusionBasis }> = ({ basis }) => (
  <div className="cpm-inv-basis">
    <span className="cpm-inv-label">{basis.lead}</span>
    {basis.items.length > 0 ? (
      <ul className="cpm-inv-chips" aria-label={basis.lead}>
        {basis.items.map(item => (
          <li key={item.label} className="cpm-inv-chip">
            <span className="cpm-inv-chip__check" aria-hidden>✓</span>
            <span className="cpm-inv-chip__text">{item.label}</span>
            {item.codes.map(code => <span key={code} className="cpm-inv-chip__code">{code}</span>)}
          </li>
        ))}
      </ul>
    ) : <p className="cpm-inv-basis__phrase">{basis.from}</p>}
  </div>
);

/** The limits, one card each: title, then the reason in secondary text. */
const Limits: React.FC<{ limits: ConclusionLimits }> = ({ limits }) => (
  <div className="cpm-inv-limits">
    <div className="cpm-title-row">
      <h3 className="cpm-panel-title">{limits.title}</h3>
      <span className="cpm-inv-count">{limits.lines.length}</span>
    </div>
    <ul className="cpm-inv-gaps" aria-label={limits.title}>
      {limits.lines.map(line => {
        const { title, reason } = limitCard(line);
        return (
          <li key={line} className="cpm-inv-gap">
            <strong className="cpm-inv-gap__title">{title}</strong>
            {reason && <span className="cpm-inv-gap__reason">{reason}</span>}
          </li>
        );
      })}
    </ul>
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
          <div className="cpm-title-row cpm-inv-headline">
            <span className={`cpm-dot cpm-tone-${conditionOf(matrix.diagnosis).tone}`} aria-hidden data-testid="result-dot" />
            <h2 className="cpm-title">{heroTitle(matrix)}</h2>
            {!latest && <span title={windowSpan({ ...matrix, windowKind }, timeZone)}><TonePill tone="muted">Earlier window</TonePill></span>}
            {isRerun(matrix) && <TonePill tone="muted">Re-run, no original stored</TonePill>}
          </div>
          {older && <p className="cpm-copy" title={matrix.lastVerdict?.windowEnd ?? undefined}>{older.replace(/^l/, 'L')}</p>}
          {basis && <Basis basis={basis} />}
          <dl className="cpm-inv-class">
            <div className="cpm-inv-class__cell">
              <dt className="cpm-inv-label cpm-title-row">
                Cause
                <Toggletip variant="how-to" label="Symptom and cause">
                  <p>The title names what was observed. A valve, controller, process or instrument cause is a separate claim, shown here only when the engine qualified one.</p>
                </Toggletip>
              </dt>
              <dd className="cpm-inv-class__value">
                {cause.text}{cause.unconfirmed && <StatusBadge tone="warning">Not confirmed</StatusBadge>}
              </dd>
            </div>
            <div className="cpm-inv-class__cell">
              <dt className="cpm-inv-label">Severity</dt>
              <dd className="cpm-inv-class__value">
                {matrix.severity && <span className={`cpm-dot cpm-tone-${toneFor(matrix.severity)}`} aria-hidden data-testid="severity-dot" />}
                {codeLabel(matrix.severity)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="cpm-inv-hero__facts">
          {heroFacts(matrix, episode).map(f => (
            <KpiCard key={f.label} headed label={f.label} bar={f.bar}
              // A word or a dash stands where a number would: the smaller size is the app's own for a value that is not a number.
              value={/\d/.test(f.value) ? f.value : <span className="cpm-metric-na">{f.value}</span>}
              tip={f.label === 'Evidence score' ? <EvidenceScoreNote /> : undefined} />
          ))}
        </div>
      </div>
      {limits.lines.length > 0 && <Limits limits={limits} />}
    </section>
  );
};

export default InvestigationHero;
