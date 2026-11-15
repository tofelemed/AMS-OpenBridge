/**
 * CHG-197 (owner Q10, approved 2026-11-15): the Response tab as separate trends, one per row at full width, never side by side.
 * Each trend has its heading in words, a "?" tip saying how the engine measures what it draws, and its own Zoom area / Undo /
 * Reset; all of them share one time range and one ECharts connect group, so the cursor and the zoom stay aligned down the page
 * (Reset on any one restores all). Replaces the two-pane ResponseChart (output + input).
 * CHG-198: a redraw from the historian renders the same trends with a line above them (lead) and one where Model fit would be
 * (foot). CHG-200: each trend's value axis is fixed and its labels placed against it, never on a line or another label; on a
 * narrow chart the labels with a value are listed under the chart.
 */
import React, { useMemo } from 'react';
import { Toggletip } from '../../../../ui/Toggletip';
import { CpmChart } from '../../evidence/CpmChart';
import type { DecodedArtifact } from '../../evidence/artifactCodec';
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import { drawMarks } from './annotations';
import { buildFacts } from './responseFacts';
import { responseTrendSpecs } from './responseTrendSpecs';
import { trendYRange } from './trendSupport';

export const ResponseTrends: React.FC<{
  byKind: Record<string, DecodedArtifact[]>;
  metrics: ResponseQuantity[] | undefined;
  result: ResponseEventDetail['result'] | undefined;
  t0Ms: number;
  pvUnit?: string | null;
  timeZone: string;
  healthExclusions: string[];
  /** CHG-198: shown above the trends, and after the last one. */
  lead?: React.ReactNode;
  foot?: React.ReactNode;
}> = ({ byKind, metrics, result, t0Ms, pvUnit, timeZone, healthExclusions, lead, foot }) => {
  const facts = useMemo(() => buildFacts({ byKind, metrics, result, t0Ms, pvUnit }), [byKind, metrics, result, t0Ms, pvUnit]);
  // CHG-200: each trend's value axis is fixed, so its labels are placed against it (labelLayout)
  const specs = useMemo(() => (facts ? responseTrendSpecs(facts).map(spec => ({ spec, yRange: trendYRange(spec) })) : []), [facts]);
  if (!facts) return null;
  const group = `response-trends-${result?.method_run_id ?? 'event'}`;
  return (
    <section className="cpm-surface" aria-label="Response trends">
      {lead}
      <div className="cpm-response-trend-rows">
        {specs.map(({ spec: s, yRange }) => (
          <CpmChart key={s.id} title={s.title} headingLevel={2} exportInHead series={s.series} xKind="time" timeZone={timeZone} height={s.height}
            xRange={facts.xRange} yRange={yRange} zoomY={false} connectGroup={group} annotate={drawMarks(s.marks, s.unit, { series: s.series, xRange: facts.xRange, yRange })}
            help={<Toggletip variant="how-to" label={`${s.title}: how it is measured`}>{s.help.map(p => <p key={p}>{p}</p>)}</Toggletip>} />
        ))}
      </div>
      {foot}
      {healthExclusions.length > 0 && (
        <p className="cpm-copy" data-list="health-exclusions">Health exclusions: {healthExclusions.join(' · ')}</p>
      )}
    </section>
  );
};

export default ResponseTrends;
