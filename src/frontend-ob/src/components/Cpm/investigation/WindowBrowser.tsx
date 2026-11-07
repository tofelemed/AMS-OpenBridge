/**
 * Recent evaluated windows with a PREVIOUS/CURRENT delta table over the key facts, in the Compare windows dialog (CHG-141).
 * Split out of CpmInvestigation in v2.5 (1E.2).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { toneFor } from '../shared';
import { KEY_FACTS, fmtFact } from './keyFacts';
import { diagnosisLabel } from '../vocabulary';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
import { MetricValue } from '../MetricValue';
import { fmtInstant } from '../context/LoopContextBar';
import { windowSize, windowSpan } from '../windowLabel';
import { EVIDENCE_SCORE_HELP, evidenceScore } from '../evidenceScore';
import { hasVerdict } from '../metricAvailability';
import type { WindowOption } from '../evidence/useEvidenceWindows';
import { sameInstant } from '../evidence/useWindowAt';
import { comparisonNote, type Comparison } from './comparisonNote';

const PAGE = 5;

export const WindowBrowser: React.FC<{
  /** The loop's evaluated windows, newest first: the same list the Evidence pages read (useEvidenceWindows). */
  windows: WindowOption[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  matrix: CpmGateMatrix;
  previous: CpmGateMatrix | undefined;
  comparison: Comparison;
  windowKind: string;
  /** Opens the window that was picked, by its end. */
  onWindow: (end: string) => void;
}> = ({ windows, hasMore, isLoadingMore, loadMore, matrix, previous, comparison, windowKind, onWindow }) => {
  const metrics = matrix.metrics ?? {};
  // CHG-054: page through the windows five at a time; open on the page holding the CURRENT window
  const at = Math.max(0, windows.findIndex(w => sameInstant(w.windowEnd, matrix.windowEnd)));
  const [page, setPage] = useState(Math.floor(at / PAGE));
  useEffect(() => { setPage(Math.floor(at / PAGE)); }, [at]);
  // "Older" on the last loaded page asks for the next page of windows, then moves onto it
  const advance = useRef(false);
  useEffect(() => { if (advance.current) { advance.current = false; setPage(x => x + 1); } }, [windows.length]);
  const shown = windows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(windows.length / PAGE));
  // the comparison table renders only with a previous window; the fallback keeps the types simple
  const prevCtx = contextOfMatrix(previous ?? matrix);
  const curCtx = contextOfMatrix(matrix);
  const confPrev = metricAvailability(prevCtx, 'confidence', previous?.confidence);
  const confCur = metricAvailability(curCtx, 'confidence', matrix.confidence);
  // CHG-065: like every other surface, an evidence score only on a window that has a verdict
  const pct = (v: number | null | undefined, m?: CpmGateMatrix) => (v != null && (!m || hasVerdict(m.diagnosis)) ? String(evidenceScore(v)) : '—');
  const side = (m: CpmGateMatrix | undefined, which: string) => {
    const d = (m?.diagnosis ?? '').toUpperCase();
    return d.startsWith('EXCLUDED') ? `${which} window excluded (loop not in automatic)`
      : d.startsWith('INSUFFICIENT') ? `${which} window had insufficient data` : null;
  };
  const notComparable = [side(previous, 'Previous'), side(matrix, 'Current')].filter(Boolean).join(' · ');
  return (
    <>
      {/* SME #18 (CHG-054): each window by its END and SIZE — sliding windows share a date and often a verdict */}
      <div className="cpm-window-tiles" role="list" aria-label={`Evaluated ${windowKind} windows`}>
        {shown.map(w => {
          const current = sameInstant(matrix.windowEnd, w.windowEnd);
          const latest = w.windowEnd === windows[0]?.windowEnd;
          return (
            <div key={w.windowEnd ?? ''} role="listitem" className="cpm-window-tiles__item">
            <button type="button"
              className={`cpm-window-tile${current ? ' cpm-window-tile--current' : ''}`}
              aria-current={current ? 'true' : undefined} title={windowSpan({ windowStart: w.windowStart, windowEnd: w.windowEnd, windowKind })}
              onClick={() => { if (w.windowEnd) onWindow(w.windowEnd); }}>
              <span className="cpm-window-tile__end">Ends {fmtInstant(w.windowEnd)}{latest && <span className="cpm-window-tile__tag">Latest</span>}</span>
              <span className="cpm-window-tile__sub">
                <span className={`cpm-dot cpm-tone-${toneFor(w.diagnosis ?? null)}`} aria-hidden />
                {windowSize({ windowStart: w.windowStart, windowEnd: w.windowEnd, windowKind })} · {diagnosisLabel(w.diagnosis ?? null)}
              </span>
            </button>
            </div>
          );
        })}
      </div>
      {(pages > 1 || hasMore) && (
        <div className="cpm-filter-row cpm-window-tiles__pager">
          <span title={page === 0 ? 'Already showing the newest windows' : undefined}><ObcButton variant="flat" disabled={page === 0} onClick={() => setPage(x => x - 1)}>‹ Newer</ObcButton></span>
          <span className="cpm-copy">{page * PAGE + 1}–{Math.min(windows.length, page * PAGE + PAGE)} of {windows.length}{hasMore ? '+' : ''}</span>
          <span title={page >= pages - 1 && !hasMore ? 'Already showing the oldest stored windows' : undefined}>
            <ObcButton variant="flat" disabled={(page >= pages - 1 && !hasMore) || isLoadingMore}
              onClick={() => { if (page >= pages - 1) { advance.current = true; loadMore(); } else setPage(x => x + 1); }}>Older ›</ObcButton></span>
        </div>
      )}
      {previous ? (
        <div className="cpm-matrix-scroll" style={{ marginTop: 12 }}>
          <table className="cpm-matrix">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                {/* P2-13: a 24h window ending near midnight lands on a
                    different DAY in local vs UTC — name the instant+zone. */}
                <th title={windowSpan({ ...previous, windowKind })}>Previous · {windowSize({ ...previous, windowKind })} ending {fmtInstant(previous.windowEnd)}</th>
                <th title={windowSpan({ ...matrix, windowKind })}>Current · {windowSize({ ...matrix, windowKind })} ending {fmtInstant(matrix.windowEnd)}</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}>Diagnosis</td>
                <td>{diagnosisLabel(previous.diagnosis)}</td>
                <td>{diagnosisLabel(matrix.diagnosis)}</td>
                <td>{previous.diagnosis === matrix.diagnosis ? 'unchanged' : 'changed'}</td>
              </tr>
              {notComparable && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'left' }} className="cpm-metric-na">{notComparable}</td>
                </tr>
              )}
              <tr>
                <td style={{ textAlign: 'left' }} title={EVIDENCE_SCORE_HELP}>Evidence score</td>
                <td><MetricValue a={confPrev} text={pct(previous.confidence, previous)} /></td>
                <td><MetricValue a={confCur} text={pct(matrix.confidence, matrix)} /></td>
                <td>{confPrev.state === 'measured' && confCur.state === 'measured'
                  ? `${(((matrix.confidence ?? 0) - (previous.confidence ?? 0)) * 100).toFixed(0)} pt` : '—'}</td>
              </tr>
              {KEY_FACTS.map(f => {
                const prev = previous.metrics?.[f.field];
                const cur = metrics[f.field];
                if (prev == null && cur == null) return null;
                // I3: same scale/unit as the Key-facts tiles — this table
                // showed good_error_pct as 0.67 while the tile above said
                // 67%: one value, two units, one screen.
                const s = f.scale ?? 1;
                // CHG-053: a delta needs two measurements; a placeholder 0 or an excluded window is not one
                const aPrev = metricAvailability(prevCtx, f.field, prev);
                const aCur = metricAvailability(curCtx, f.field, cur);
                return (
                  <tr key={f.field}>
                    <td style={{ textAlign: 'left' }}>{f.label}</td>
                    <td><MetricValue a={aPrev} text={fmtFact(f, (prev ?? 0) * s)} /></td>
                    <td><MetricValue a={aCur} text={fmtFact(f, (cur ?? 0) * s)} /></td>
                    <td>{aPrev.state === 'measured' && aCur.state === 'measured' ? fmtFact(f, ((cur ?? 0) - (prev ?? 0)) * s) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="cpm-copy" style={{ marginTop: 8 }}>{comparisonNote(comparison)}</p>
      )}
    </>
  );
};

export default WindowBrowser;
