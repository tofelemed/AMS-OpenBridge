/**
 * TrendPanel with sample data for the R3 evidence: a real gap, a no-sample stretch, mode and verdict
 * lanes, and two grouped panels for cursor sync. Fixed times, so captures compare between runs.
 */
import React, { useMemo, useState } from 'react';
import { TrendPanel, type TrendLane, type TrendPane } from '../../ui/trend';

const START = Date.UTC(2026, 10, 4, 0, 0);
const STEP = 60_000;
const COUNT = 480;
const END = START + (COUNT - 1) * STEP;
const WINDOW = { from: START, to: END };
const ZONE = 'Asia/Dubai';

/** A 40-minute outage in the middle. Null is a gap, never zero. */
const isGap = (i: number) => i >= 200 && i < 240;

function makePane(): TrendPane {
  const x = Array.from({ length: COUNT }, (_, i) => START + i * STEP);
  const signal = (mean: number, amp: number, period: number) =>
    x.map((_, i) => (isGap(i) ? null : Number((mean + amp * Math.sin(i / period)).toFixed(2))));
  return {
    id: 'signals',
    axes: [
      { id: 'pv', label: 'PV / SP', unit: 'kg/h' },
      { id: 'op', label: 'Controller output', output: true, range: { min: 0, max: 100 } },
    ],
    series: [
      { id: 'pv', label: 'PV', role: 'pv', axis: 'pv', x, y: signal(50, 4, 18) },
      { id: 'sp', label: 'SP', role: 'sp', axis: 'pv', x, y: signal(50, 0, 1), held: true },
      { id: 'op', label: 'Controller output', role: 'op', axis: 'op', x, y: signal(42, 6, 30) },
    ],
  };
}

const LANES: TrendLane[] = [
  {
    id: 'mode', label: 'Mode', kind: 'mode',
    segments: [
      { startMs: START, endMs: START + 200 * STEP, label: 'AUTO', tone: 'neutral' },
      { startMs: START + 240 * STEP, endMs: END, label: 'CAS', tone: 'neutral' },
    ],
  },
  {
    id: 'verdict', label: 'Verdict', kind: 'verdict',
    segments: [
      { id: 'w1', startMs: START, endMs: START + 200 * STEP, label: 'No fault', tone: 'neutral' },
      { id: 'w2', startMs: START + 240 * STEP, endMs: END, label: 'Oscillation suspected', shortLabel: 'Suspected', tone: 'warn' },
    ],
  },
];

export const GalleryTrend: React.FC = () => {
  const panes = useMemo(() => [makePane()], []);
  const second = useMemo(() => [{ ...makePane(), id: 'second' }], []);
  const [band, setBand] = useState<string | null>(null);
  return (
    <>
      <TrendPanel
        heading="Signals"
        zone={ZONE}
        panes={panes}
        lanes={LANES}
        plotWindow={WINDOW}
        gapStepMs={STEP * 3}
        source="Sample data"
        aggregation="1 min samples"
        context="FIC10302 · Reactor feed flow"
        group="gallery"
        selectedBandId={band}
        onSelectBand={b => setBand(b?.id ?? null)}
      />
      <TrendPanel
        heading="Same window, second panel"
        zone={ZONE}
        panes={second}
        plotWindow={WINDOW}
        gapStepMs={STEP * 3}
        source="Sample data"
        aggregation="1 min samples"
        group="gallery"
      />
      <TrendPanel
        heading="Stale panel"
        zone={ZONE}
        panes={panes}
        plotWindow={WINDOW}
        source="Sample data"
        aggregation="1 min samples"
        state={{ kind: 'stale', since: END }}
      />
      <TrendPanel heading="Empty panel" zone={ZONE} panes={[]} source="Sample data" aggregation="1 min samples" state={{ kind: 'empty', message: 'No samples in this window.' }} />
      <TrendPanel heading="Failed panel" zone={ZONE} panes={[]} source="Sample data" aggregation="1 min samples" state={{ kind: 'error', message: 'The historian did not respond.' }} />
    </>
  );
};
