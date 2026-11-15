/**
 * CHG-198 (owner, approved 2026-11-15): the trends of an event redrawn from the historian. The CHG-197 trends themselves (headings,
 * "?" tips, linked time axis, zoom, Export CSV), under one plain line said once; where Model fit would be, one plain line that it
 * exists only with the stored charts (only when the event had a fitted model). NotRedrawn is that line on the other tabs.
 */
import React from 'react';
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import { metricOf } from '../responseSupport';
import { ResponseTrends } from '../trends/ResponseTrends';
import { NOT_REDRAWN, REDRAWN_LABEL } from './redrawWords';
import type { Redrawn } from './useRedraw';

export const NotRedrawn: React.FC<{ text: string; className?: string }> = ({ text, className }) =>
  <p className={className ? `cpm-copy ${className}` : 'cpm-copy'}>{text}</p>;

export const RedrawnTrends: React.FC<{
  redrawn: Redrawn;
  metrics: ResponseQuantity[] | undefined;
  result: ResponseEventDetail['result'] | undefined;
  t0Ms: number;
  pvUnit?: string | null;
  timeZone: string;
  healthExclusions: string[];
}> = ({ redrawn, metrics, result, t0Ms, pvUnit, timeZone, healthExclusions }) => {
  const censored = [result?.capture_state, result?.evaluation_state].includes('CENSORED');
  // a fitted model reports its gain (process_gain, or integrating_gain for a level loop)
  const fitted = !censored && ['process_gain', 'integrating_gain'].some(id => metricOf(metrics, id)?.value != null);
  return (
    <ResponseTrends byKind={redrawn.byKind} metrics={metrics} result={result} t0Ms={t0Ms} pvUnit={pvUnit} timeZone={timeZone} healthExclusions={healthExclusions}
      lead={<p className="cpm-copy cpm-response-redrawn__lead">{REDRAWN_LABEL}</p>}
      foot={fitted ? <NotRedrawn text={NOT_REDRAWN.modelFit} className="cpm-response-redrawn__foot" /> : null} />
  );
};

export default RedrawnTrends;
