/**
 * Recent evaluated windows with a PREVIOUS/CURRENT delta table over the key facts.
 * Split out of CpmInvestigation in v2.5 (1E.2).
 */
import React from 'react';
import type { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { PanelHead, fmtDateTime } from '../shared';
import { KEY_FACTS, fmtFact } from './keyFacts';
import { diagnosisLabel } from '../vocabulary';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
import { MetricValue } from '../MetricValue';

type SetParams = ReturnType<typeof useSearchParams>[1];

export const WindowBrowser: React.FC<{
  windows: CpmGateMatrix[];
  matrix: CpmGateMatrix;
  previous: CpmGateMatrix | undefined;
  windowKind: string;
  setParams: SetParams;
}> = ({ windows, matrix, previous, windowKind, setParams }) => {
  const metrics = matrix.metrics ?? {};
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
        right={<span className="cpm-copy">newest first · click to pin as CURRENT</span>} />
      <div className="cpm-filter-row">
        {windows.slice(0, 5).map(w => (
          <ObcButton key={w.windowEnd ?? ''} variant={matrix.windowEnd === w.windowEnd ? 'raised' : 'normal'}
            onClick={() => setParams(p => {
              p.set('mode', 'historical');
              if (w.windowEnd) p.set('window', w.windowEnd);
              return p;
            }, { replace: true })}>
            {w.windowEnd
              ? new Date(w.windowEnd).toLocaleString(undefined, windowKind === '12h'
                ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
                : { month: 'short', day: 'numeric' })
              : '—'}
            {' · '}{diagnosisLabel(w.diagnosis)}
          </ObcButton>
        ))}
      </div>
      {previous ? (
        <div className="cpm-matrix-scroll" style={{ marginTop: 12 }}>
          <table className="cpm-matrix">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                {/* P2-13: a 24h window ending near midnight lands on a
                    different DAY in local vs UTC — name the instant+zone. */}
                <th>PREVIOUS (ends {previous.windowEnd ? fmtDateTime(previous.windowEnd) : '—'})</th>
                <th>CURRENT (ends {matrix.windowEnd ? fmtDateTime(matrix.windowEnd) : '—'})</th>
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
