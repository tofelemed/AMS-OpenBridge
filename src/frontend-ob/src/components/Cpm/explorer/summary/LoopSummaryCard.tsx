/**
 * Explorer › Summary › Loop summary (SME review 2026-10-05, point 4).
 *
 * The first thing on the loop page — above the tabs, so it heads every tab and
 * fits the first screen: the condition, how severe, the leading
 * cause, the evidence that was seen, the data behind it, what is limited, and
 * the next thing to check — before the live tiles, the loop model and the gate
 * strip. Every fact comes from the gates/latest row LoopWorkspace already
 * holds (same query key, no request); the words come from ./summaryText.
 *
 * Laid out like the KPI tiles (tone on the left border) so it reads as part of
 * the same product. The confidence is called an evidence score, as the
 * Workbench labels it: the engine's scores are uncalibrated, not probabilities.
 */
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';
import { TonePill, toneFor } from '../../shared';
import { fmtInstant, fmtPeriod } from '../../context/LoopContextBar';
import { evidenceHref, historicalHref, investigationHref, windowsHref } from '../../cpaHref';
import { workbenchHref } from '../../evidence/selection';
import { trendPeriodOf } from '../../trend/trendPeriod';
import { pinEvaluated, revealTrend } from '../../trend/evaluatedWindow';
import {
  ageText, conditionOf, evidenceOf, leadingCauseOf, limitationsOf, nextCheckOf, primaryActionOf, staleAfterMs,
} from './summaryText';

const MAX_LIMITS = 2;

/**
 * The Workbench exit: the exact fused run when the row carries one, else the
 * loop-level landing (its newest window with run identity).
 */
export function workbenchExit(loopId: string, matrix: CpmGateMatrix | undefined, windowKind: string) {
  const g15 = matrix?.methodRunIds?.G15 ?? matrix?.gates.find(g => g.key === 'G15')?.methodRunId ?? null;
  return g15
    ? { href: workbenchHref(loopId, g15, 'G15'), title: `Open the fused ${windowKind} run ${g15} in the Evidence Workbench` }
    : { href: evidenceHref(loopId, { kind: windowKind }), title: 'Open the newest window with run identity in the Evidence Workbench' };
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt className="cpm-loop-summary__label">{label}</dt>
    <dd className="cpm-loop-summary__value">{children}</dd>
  </>
);

export const LoopSummaryCard: React.FC<{
  loop: CpmLoop;
  matrix: CpmGateMatrix;
  windowKind: string;
}> = ({ loop, matrix, windowKind }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const workbench = workbenchExit(loop.loopId, matrix, windowKind);
  const condition = conditionOf(matrix.diagnosis);
  const finding = condition.kind === 'finding';
  const cause = leadingCauseOf(matrix);
  const evidence = evidenceOf(matrix);
  const limits = limitationsOf(matrix.observabilityFlags);
  const last = matrix.lastVerdict;
  const score = finding && matrix.confidence != null ? Math.round(matrix.confidence * 100) : null;
  const endMs = matrix.windowEnd ? Date.parse(matrix.windowEnd) : NaN;
  const windowAge = Number.isFinite(endMs) && Date.now() - endMs > staleAfterMs(windowKind) ? ageText(Date.now() - endMs) : null;
  const action = primaryActionOf(condition);
  const actionHref = action.target === 'windows' ? windowsHref(loop.loopId)
    : action.target === 'historical' ? historicalHref(loop.loopId, trendPeriodOf(params))
    : investigationHref(loop.loopId, { kind: windowKind });

  return (
    <section className={`cpm-loop-summary cpm-loop-summary--${condition.tone}`} aria-label="Loop summary">
      <div className="cpm-loop-summary__head">
        <div>
          <span className="cpm-eyebrow">Loop summary · latest {windowKind} evaluated window</span>
          <h2 className="cpm-loop-summary__condition">{condition.label}</h2>
        </div>
        {finding && matrix.severity && (
          <span className="cpm-loop-summary__severity">
            <TonePill tone={toneFor(matrix.severity)}>Severity {matrix.severity.toLowerCase()}</TonePill>
            <span className="cpm-loop-summary__muted">loop criticality {loop.criticality}</span>
          </span>
        )}
      </div>

      {last && (
        <p className="cpm-loop-summary__note">
          The newest window has no verdict. Last verdict: <strong>{conditionOf(last.diagnosis).label}</strong>
          {last.windowEnd ? `, window ending ${fmtInstant(last.windowEnd)}` : ''}
          {last.ageMs != null ? ` (${ageText(last.ageMs)})` : ''}.
        </p>
      )}

      <dl className="cpm-loop-summary__rows">
        {finding && (
          <Row label="Possible cause">
            {cause ?? 'No mechanism qualified'}
            {cause && !(matrix.verdictV2?.leadingHypothesis === 'STICTION' && matrix.verdictV2?.confirmation?.state === 'CONFIRMED') && (
              <span className="cpm-loop-summary__muted"> · not confirmed</span>
            )}
            {score != null && (
              <span className="cpm-loop-summary__muted"
                title="The engine's evidence score for this result (0–100). Uncalibrated: it ranks evidence, it is not a probability.">
                {' · '}evidence score {score}
              </span>
            )}
          </Row>
        )}
        {evidence.length > 0 && (
          <Row label="Evidence seen">
            <span className="cpm-loop-summary__chips">
              {evidence.map(e => (
                <span key={e.label} className="cpm-loop-summary__chip">
                  {e.label}{e.main ? '' : <span className="cpm-loop-summary__muted"> · supporting</span>}
                </span>
              ))}
            </span>
          </Row>
        )}
        <Row label="Data">
          {matrix.sampleCount != null ? `${matrix.sampleCount.toLocaleString()} samples · ` : ''}
          {fmtPeriod({ label: `${windowKind} window`, start: matrix.windowStart, end: matrix.windowEnd })}
          {windowAge && <strong className="cpm-loop-summary__stale"> · ended {windowAge}</strong>}
          {matrix.windowStart && matrix.windowEnd && (
            <ObcButton variant="flat" className="cpm-loop-summary__inline-action"
              title="Show this evaluated window on the trend, compared with now"
              onClick={() => { setParams(p => pinEvaluated(p, matrix.windowStart!, matrix.windowEnd!), { replace: true }); revealTrend(); }}>
              Show on trend ›
            </ObcButton>
          )}
        </Row>
        {limits.length > 0 && (
          <Row label="Limitations">
            <ul className="cpm-loop-summary__limits">
              {limits.slice(0, MAX_LIMITS).map(l => <li key={l}>{l}</li>)}
              {limits.length > MAX_LIMITS && (
                <li className="cpm-loop-summary__muted" title={limits.slice(MAX_LIMITS).join('\n')}>
                  and {limits.length - MAX_LIMITS} more
                </li>
              )}
            </ul>
          </Row>
        )}
      </dl>

      <div className="cpm-loop-summary__next">
        <span className="cpm-loop-summary__label">Next check</span>
        <p className="cpm-loop-summary__next-text">{nextCheckOf(matrix, condition)}</p>
        <span className="cpm-loop-summary__actions">
          <ObcButton variant="raised" onClick={() => navigate(actionHref)}>{action.label}</ObcButton>
          <ObcButton variant="normal" title={workbench.title} onClick={() => navigate(workbench.href)}>
            Evidence workbench ›
          </ObcButton>
        </span>
      </div>
    </section>
  );
};

export default LoopSummaryCard;
