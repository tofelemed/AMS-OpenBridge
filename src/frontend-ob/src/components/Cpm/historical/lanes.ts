/**
 * CHG-139: what the Mode and Result lanes draw.
 *
 * A 12 h or 24 h window closes every 15 minutes, so each window overlaps the next by almost its whole length.
 * Drawn across its window, a result lane is a pile of overlapping bars that says nothing about when a result was
 * reached. A result is therefore marked where its window ENDS, as wide as the time since the previous result (at
 * most one 15 minute step), so neighbours never overlap and a silence stays a silence. The selected window keeps
 * its whole span, which the chart shades on the signal lane.
 */
import { sameInstant } from '../evidence/useWindowAt';
import { classifyMode, diagnosisBand } from '../shared';
import { modeWord } from '../../../utils/modeVocabulary';
import { bandOf, diagnosisLabel } from '../vocabulary';
import type { Segment } from './chartOption';

/** The step at which windows close; also the widest a single result mark gets. */
export const RESULT_STEP_MS = 15 * 60_000;

export interface ResultRow {
  windowStart: string | null;
  windowEnd: string | null;
  diagnosis: string | null;
}

export interface ResultMarkers {
  markers: Segment[];
  /** The selected window's whole span, or null when none is selected or its start is not stored. */
  selected: { startMs: number; endMs: number } | null;
}

export function resultMarkers(
  rows: ResultRow[], range: { from: number; to: number }, selectedEnd?: string | null,
): ResultMarkers {
  const dated = rows
    .flatMap(r => { const endMs = r.windowEnd ? Date.parse(r.windowEnd) : NaN; return Number.isFinite(endMs) ? [{ r, endMs }] : []; })
    .sort((a, b) => a.endMs - b.endMs);
  const markers: Segment[] = [];
  dated.forEach(({ r, endMs }, i) => {
    if (endMs < range.from || endMs > range.to) return;
    const gap = i > 0 ? endMs - dated[i - 1].endMs : RESULT_STEP_MS;
    const span = gap > 0 ? Math.min(gap, RESULT_STEP_MS) : RESULT_STEP_MS;
    const band = diagnosisBand(r.diagnosis);
    const label = band.label;
    const detail = diagnosisLabel(r.diagnosis);
    markers.push({
      startMs: endMs - span, endMs,
      // No fault is green in this lane only; everywhere else it stays grey (SME review 2 #12).
      tone: bandOf(r.diagnosis) === 'NO_FAULT' ? 'good' : band.tone,
      label, detail: detail !== label ? detail : undefined, windowEnd: r.windowEnd,
    });
  });
  const pick = selectedEnd ? dated.find(d => sameInstant(d.r.windowEnd, selectedEnd))?.r : undefined;
  const startMs = pick?.windowStart ? Date.parse(pick.windowStart) : NaN;
  const endMs = pick?.windowEnd ? Date.parse(pick.windowEnd) : NaN;
  return { markers, selected: Number.isFinite(startMs) && Number.isFinite(endMs) ? { startMs, endMs } : null };
}

/**
 * Controller-mode runs from the mode track: neighbours with one mode merge, the last runs to the end of the range. CHG-200 (final
 * test #13; owner Q3, no green for normal): a normal (auto) mode is neutral, a mode that needs a look (manual, not recognised) is
 * amber, as the Explorer mode box classifies them; each run is named by its word ("Auto", not "AUT").
 */
export function modeSegmentsOf(points: Array<{ ts: number; mode?: unknown }>, toMs: number): Segment[] {
  const pts = points.flatMap(p => (typeof p.mode === 'string' ? [{ ts: p.ts, mode: p.mode }] : []));
  const out: Segment[] = [];
  for (let i = 0; i < pts.length; i++) {
    // classifyMode mirrors the engine's vocabulary (AUT/CAS/CASCADE are auto).
    const tone = classifyMode(pts[i].mode) === 'auto' ? 'muted' : 'warn';
    const label = modeWord(pts[i].mode);
    const endMs = pts[i + 1]?.ts ?? toMs;
    const head = out[out.length - 1];
    if (head && head.label === label) { head.endMs = endMs; continue; }
    out.push({ startMs: pts[i].ts, endMs, tone, label });
  }
  return out;
}
