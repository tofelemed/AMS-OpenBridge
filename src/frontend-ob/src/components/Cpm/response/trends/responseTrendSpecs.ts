/**
 * CHG-197 (owner Q10): the Response tab's trends in page order, each only when it applies to the event (a trend that does not
 * apply is left out, never shown empty). A censored event has the measured response and the input only.
 */
import type { ResponseFacts } from './responseFacts';
import type { TrendSpec } from './trendSupport';
import { measuredTrend } from './measuredTrend';
import { inputTrend } from './inputTrend';
import { deadTimeTrend } from './deadTimeTrend';
import { riseSettleTrend } from './riseSettleTrend';
import { overshootTrend } from './overshootTrend';
import { slopeTrend } from './slopeTrend';
import { errorTrend } from './errorTrend';
import { modelFitTrend } from './modelFitTrend';

const ORDER = [measuredTrend, inputTrend, deadTimeTrend, riseSettleTrend, overshootTrend, slopeTrend, errorTrend, modelFitTrend];

export function responseTrendSpecs(f: ResponseFacts): TrendSpec[] {
  const all = ORDER.map(build => build(f)).filter((s): s is TrendSpec => s != null);
  return f.censored ? all.filter(s => s.id === 'measured' || s.id === 'input') : all;
}
