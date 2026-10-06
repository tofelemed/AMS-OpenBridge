/**
 * Recent evaluated windows with a PREVIOUS/CURRENT delta table over the key facts.
 * Split out of CpmInvestigation in v2.5 (1E.2).
 */
import React, { useEffect, useState } from 'react';
import type { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { PanelHead, toneFor } from '../shared';
import { KEY_FACTS, fmtFact } from './keyFacts';
import { diagnosisLabel } from '../vocabulary';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
import { MetricValue } from '../MetricValue';
import { fmtInstant } from '../context/LoopContextBar';
import { windowSize, windowSpan } from '../windowLabel';

const PAGE = 5;

type SetParams = ReturnType<typeof useSearchParams>[1];

export const WindowBrowser: React.FC<{
  windows: CpmGateMatrix[];
  matrix: CpmGateMatrix;
  previous: CpmGateMatrix | undefined;
  windowKind: string;
  setParams: SetParams;
}> = ({ windows, matrix, previous, windowKind, setParams }) => {
  const metrics = matrix.metrics ?? {};
  // CHG-054: page through the windows five at a time; open on the page holding the CURRENT window
  const at = Math.max(0, windows.findIndex(w => w.windowEnd === matrix.windowEnd));
  const [page, setPage] = useState(Math.floor(at / PAGE));
  useEffect(() => { setPage(Math.floor(at / PAGE)); }, [at]);
  const shown = windows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(windows.length / PAGE));
  // the comparison table renders only with a previous window; the fallback keeps the types simple
  const prevCtx = contextOfMatrix(previous ?? matrix);
  const curCtx = contextOfMatrix(matrix);
  const confPrev = metricAvailability(prevCtx, 'confidence', previous?.confidence);
  const confCur = metricAvailability(curCtx, 'confidence', matrix.confidence);
  const pct = (v: number | null | undefined) => (v != null ? `${(v * 100).toFixed(0)}%` : '—');
  const side = (m: CpmGateMatrix | undefined, which: string) => {
    const d = (m?.diagnosis ?? '').toUpperCase();
    return d.startsWith('EXCLUDED') ? `${which} window excluded (loop not in automatic)`
      : d.startsWith('INSUFFICIENT') ? `${which} window had insufficient data` : null;
  };
  const notComparable = [side(previous, 'Previous'), side(matrix, 'Current')].filter(Boolean).join(' · ');
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Window browser" title={`Recent ${windowKind} windows`}
        right={<span className="cpm-copy">newest first · pick one to make it CURRENT</span>} />
      {/* SME #18 (CHG-054): each window by its END and SIZE — sliding windows share a date and often a verdict */}
      <div className="cpm-window-tiles" role="list" aria-label={`Evaluated ${windowKind} windows`}>
        {shown.map(w => {
          const current = matrix.windowEnd === w.windowEnd;
          const latest = w.windowEnd === windows[0]?.windowEnd;
          return (
            <button key={w.windowEnd ?? ''} type="button" role="listitem"
              className={`cpm-window-tile${current ? ' cpm-window-tile--current' : ''}`}
              aria-current={current ? 'true' : undefined} title={windowSpan({ ...w, windowKind })}
              aria-label={`${windowSpan({ ...w, windowKind })}: ${diagnosisLabel(w.diagnosis)}${latest ? ', latest' : ''}`}
              onClick={() => setParams(p => {
                p.set('mode', 'historical');
                if (w.windowEnd) p.set('window', w.windowEnd);
                return p;
              }, { replace: true })}>
              <span className="cpm-window-tile__end">Ends {fmtInstant(w.windowEnd)}{latest && <span className="cpm-window-tile__tag">Latest</span>}</span>
              <span className="cpm-window-tile__sub">
                <span className={`cpm-dot cpm-tone-${toneFor(w.diagnosis)}`} aria-hidden />
                {windowSize({ ...w, windowKind })} · {diagnosisLabel(w.diagnosis)}
              </span>
            </button>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="cpm-filter-row cpm-window-tiles__pager">
          <ObcButton variant="flat" disabled={page === 0} onClick={() => setPage(x => x - 1)}>‹ Newer</ObcButton>
          <span className="cpm-copy">{page * PAGE + 1}–{Math.min(windows.length, page * PAGE + PAGE)} of {windows.length}</span>
          <ObcButton variant="flat" disabled={page >= pages - 1} onClick={() => setPage(x => x + 1)}>Older ›</ObcButton>
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
                <td style={{ textAlign: 'left' }}>Confidence</td>
                <td><MetricValue a={confPrev} text={pct(previous.confidence)} /></td>
                <td><MetricValue a={confCur} text={pct(matrix.confidence)} /></td>
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
        <p className="cpm-copy" style={{ marginTop: 8 }}>
          Only one evaluated window stored — no PREVIOUS to compare against yet.
        </p>
      )}
    </section>
  );
};

export default WindowBrowser;
