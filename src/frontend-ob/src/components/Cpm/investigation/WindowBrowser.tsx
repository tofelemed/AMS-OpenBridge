/**
 * Recent evaluated windows with a PREVIOUS/CURRENT delta table over the key facts.
 * Split out of CpmInvestigation in v2.5 (1E.2).
 */
import React from 'react';
import type { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { PanelHead, fmtDateTime } from '../shared';
import { KEY_FACTS, fmt } from './keyFacts';

type SetParams = ReturnType<typeof useSearchParams>[1];

export const WindowBrowser: React.FC<{
  windows: CpmGateMatrix[];
  matrix: CpmGateMatrix;
  previous: CpmGateMatrix | undefined;
  windowKind: string;
  setParams: SetParams;
}> = ({ windows, matrix, previous, windowKind, setParams }) => {
  const metrics = matrix.metrics ?? {};
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
            {' · '}{(w.diagnosis ?? '—').replace(/_/g, ' ').slice(0, 22)}
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
                <td>{(previous.diagnosis ?? '—').replace(/_/g, ' ')}</td>
                <td>{(matrix.diagnosis ?? '—').replace(/_/g, ' ')}</td>
                <td>{previous.diagnosis === matrix.diagnosis ? 'unchanged' : 'changed'}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>Confidence</td>
                <td>{previous.confidence != null ? (previous.confidence * 100).toFixed(0) + '%' : '—'}</td>
                <td>{matrix.confidence != null ? (matrix.confidence * 100).toFixed(0) + '%' : '—'}</td>
                <td>{previous.confidence != null && matrix.confidence != null
                  ? `${((matrix.confidence - previous.confidence) * 100).toFixed(0)} pt` : '—'}</td>
              </tr>
              {KEY_FACTS.map(f => {
                const prev = previous.metrics?.[f.field];
                const cur = metrics[f.field];
                if (prev == null && cur == null) return null;
                // I3: same scale/unit as the Key-facts tiles — this table
                // showed good_error_pct as 0.67 while the tile above said
                // 67%: one value, two units, one screen.
                const s = f.scale ?? 1;
                const u = f.unit;
                return (
                  <tr key={f.field}>
                    <td style={{ textAlign: 'left' }}>{f.label}</td>
                    <td>{prev != null ? fmt(prev * s) + u : '—'}</td>
                    <td>{cur != null ? fmt(cur * s) + u : '—'}</td>
                    <td>{prev != null && cur != null ? fmt((cur - prev) * s) + u : '—'}</td>
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
