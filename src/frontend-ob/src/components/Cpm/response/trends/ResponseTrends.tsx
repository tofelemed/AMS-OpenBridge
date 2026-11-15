/**
 * CHG-197 (owner Q10, approved 2026-11-15): the Response tab as separate trends, one per row at full width, never side by side.
 * Each trend has its heading in words, a "?" tip saying how the engine measures what it draws, and its own Zoom area / Undo /
 * Reset; all of them share one time range and one ECharts connect group, so the cursor and the zoom stay aligned down the page
 * (Reset on any one restores all). Replaces the two-pane ResponseChart (output + input).
 */
import React, { useMemo } from 'react';
import { Toggletip } from '../../../../ui/Toggletip';
import { CpmChart } from '../../evidence/CpmChart';
import type { DecodedArtifact } from '../../evidence/artifactCodec';
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import { drawMarks } from './annotations';
import { buildFacts } from './responseFacts';
import { responseTrendSpecs } from './responseTrendSpecs';

export const ResponseTrends: React.FC<{
  byKind: Record<string, DecodedArtifact[]>;
  metrics: ResponseQuantity[] | undefined;
  result: ResponseEventDetail['result'] | undefined;
  t0Ms: number;
  pvUnit?: string | null;
  timeZone: string;
  healthExclusions: string[];
}> = ({ byKind, metrics, result, t0Ms, pvUnit, timeZone, healthExclusions }) => {
  const facts = useMemo(() => buildFacts({ byKind, metrics, result, t0Ms, pvUnit }), [byKind, metrics, result, t0Ms, pvUnit]);
  const specs = useMemo(() => (facts ? responseTrendSpecs(facts) : []), [facts]);
  if (!facts) return null;
  const group = `response-trends-${result?.method_run_id ?? 'event'}`;
  return (
    <section className="cpm-surface" aria-label="Response trends">
      <div className="cpm-response-trend-rows">
        {specs.map(s => (
          <CpmChart key={s.id} title={s.title} headingLevel={2} exportInHead series={s.series} xKind="time" timeZone={timeZone} height={s.height}
            xRange={facts.xRange} zoomY={false} connectGroup={group} annotate={drawMarks(s.marks, s.unit)}
            help={<Toggletip variant="how-to" label={`${s.title}: how it is measured`}>{s.help.map(p => <p key={p}>{p}</p>)}</Toggletip>} />
        ))}
      </div>
      {healthExclusions.length > 0 && (
        <p className="cpm-copy" data-list="health-exclusions">Health exclusions: {healthExclusions.join(' · ')}</p>
      )}
    </section>
  );
};

export default ResponseTrends;
