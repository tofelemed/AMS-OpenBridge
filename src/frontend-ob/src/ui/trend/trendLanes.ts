/**
 * Lanes: categorical bands from real start and end instants, on the shared time axis. A segment
 * carries its label inside it (colour is never the only cue), a hole stays empty, and a verdict
 * segment can be selected. Pure: `renderItem` needs only what ECharts hands it.
 */
import { type ChartPalette, toneColors } from '../../charts/chartTheme';
import { CHAR_PX } from './trendLayout';
import { segmentKey } from './trendModel';
import type { TrendLane, TrendSegment, TrendTone } from './trendTypes';

const TEXT_INSET = 4;
const LABEL_SIZE = 12;

export interface LaneColors {
  fill: Record<TrendTone, string>;
  ink: Record<TrendTone, string>;
  edge: Record<TrendTone, string>;
  selected: string;
}

/** Status fills carry `action.on` text. Neutral is `surface.raised` with a thin strong edge (CD13). */
export function laneColors(p: ChartPalette, onStatus: string): LaneColors {
  const tones = toneColors(p);
  return {
    fill: { ...tones, neutral: p.raised },
    ink: { good: onStatus, warn: onStatus, bad: onStatus, muted: onStatus, neutral: p.text },
    edge: { good: p.surface, warn: p.surface, bad: p.surface, muted: p.surface, neutral: p.axis },
    selected: p.text,
  };
}

/** The label that fits a width in px: the full text, the short one, a cut one, or nothing. */
export function fitLabel(text: string, widthPx: number, shortText?: string): string {
  const chars = Math.floor((widthPx - TEXT_INSET * 2) / CHAR_PX);
  if (chars <= 0) return '';
  if (text.length <= chars) return text;
  if (shortText && shortText.length <= chars) return shortText;
  return chars >= 3 ? `${text.slice(0, chars - 1)}…` : '';
}

interface LaneParams {
  dataIndex: number;
  coordSys: { x: number; y: number; width: number; height: number };
}

interface LaneApi {
  coord: (value: number[]) => number[];
}

export function laneRenderer(lane: TrendLane, colors: LaneColors, font: string, selectedId?: string | null) {
  return (params: LaneParams, api: LaneApi) => {
    const segment = lane.segments[params.dataIndex];
    if (!segment) return null;
    const box = params.coordSys;
    const x0 = Math.max(api.coord([segment.startMs, 0])[0], box.x);
    const x1 = Math.min(api.coord([segment.endMs, 0])[0], box.x + box.width);
    if (x1 <= x0) return null;
    const width = Math.max(1, x1 - x0);
    const selected = selectedId != null && segmentKey(segment) === selectedId;
    const text = fitLabel(selected ? `Selected: ${segment.label}` : segment.label, width, segment.shortLabel);
    return {
      type: 'group' as const,
      children: [
        {
          type: 'rect' as const,
          shape: { x: x0, y: box.y, width, height: box.height },
          style: {
            fill: colors.fill[segment.tone],
            stroke: selected ? colors.selected : colors.edge[segment.tone],
            lineWidth: selected ? 2 : 1,
          },
        },
        ...(text ? [{
          type: 'text' as const,
          silent: true,
          style: {
            text, x: x0 + TEXT_INSET, y: box.y + box.height / 2,
            fill: colors.ink[segment.tone], font: `${LABEL_SIZE}px ${font}`, align: 'left', verticalAlign: 'middle',
          },
        }] : []),
      ],
    };
  };
}

export const LANE_SERIES_PREFIX = 'lane:';

export function laneSeries(lane: TrendLane, gridIndex: number, yAxisIndex: number, colors: LaneColors, font: string, selectedId?: string | null) {
  const selectable = lane.kind === 'verdict';
  return {
    id: `${LANE_SERIES_PREFIX}${lane.id}`,
    name: lane.label,
    type: 'custom' as const,
    xAxisIndex: gridIndex,
    yAxisIndex,
    silent: !selectable,
    cursor: selectable ? 'pointer' : 'default',
    renderItem: laneRenderer(lane, colors, font, selectedId),
    encode: { x: [0, 1] },
    data: lane.segments.map((s: TrendSegment, i) => [s.startMs, s.endMs, i]),
  };
}
