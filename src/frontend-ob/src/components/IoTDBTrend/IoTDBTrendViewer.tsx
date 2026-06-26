'use client';

import React, { useState, useMemo, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useMqttStore, type TrendPoint } from '../../store/mqttStore';

const T = {
  blue:          '#31598F',
  blueMid:       '#4069A5',
  blueLight:     '#EAF2FF',
  blueMuted:     '#C4D8F0',
  bg:            '#F6F8FB',
  card:          '#FFFFFF',
  border:        '#DDE3EA',
  borderLight:   '#EEF2F7',
  textPrimary:   '#1F2937',
  textSecondary: '#6B7280',
  textMuted:     '#9CA3AF',
  success:       '#2E8B57',
  successBg:     '#ECFDF5',
  successBorder: '#A7F3D0',
  warning:       '#B45309',
  warningBg:     '#FFFBEB',
  warningBorder: '#FDE68A',
  critical:      '#D64545',
  criticalBg:    '#FEF2F2',
  criticalBorder:'#FCA5A5',
  caution:       '#D97706',
  radius:        '12px',
  radiusSm:      '8px',
  shadow:        '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

const SEVERITY_COLOR: Record<number, string> = {
  1: T.caution, 2: T.warning, 3: T.critical,
};

/* Quick-select presets */
const PRESETS = [
  { label: 'Last 1 h',  ms: 60 * 60 * 1000 },
  { label: 'Last 6 h',  ms: 6  * 60 * 60 * 1000 },
  { label: 'Last 24 h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7 d',  ms: 7  * 24 * 60 * 60 * 1000 },
];

const IoTDBTrendViewer: React.FC = () => {
  const fetchTrend = useMqttStore(s => s.fetchTrend);

  const [series,    setSeries]    = useState('root.ams.site1.alarms.*');
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(Date.now() - 6 * 60 * 60 * 1000), new Date(),
  ]);
  const [loading,   setLoading]   = useState(false);
  const [points,    setPoints]    = useState<TrendPoint[]>([]);
  const [error,     setError]     = useState<string | null>(null);
  const [queried,   setQueried]   = useState(false);

  const runQuery = useCallback(async () => {
    const [start, end] = dateRange;
    if (!start || !end || !series.trim()) return;
    setLoading(true); setError(null);
    try {
      const pts = await fetchTrend(series.trim(), start, end, 600);
      setPoints(pts);
      setQueried(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [dateRange, series, fetchTrend]);

  /* SVG sparkline — maps severity over time */
  const { sparklinePath, sparklineColor, yMax } = useMemo(() => {
    const vals = points.map(p => typeof p.severity === 'number' ? p.severity : Number(p.severity) || 0);
    if (vals.length < 2) return { sparklinePath: null, sparklineColor: T.blue, yMax: 1 };
    const W = 800, H = 80;
    const max = Math.max(...vals, 1);
    const xs  = vals.map((_, i) => (i / (vals.length - 1)) * W);
    const ys  = vals.map(v => H - (v / max) * (H - 6));
    const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const avgSev = vals.reduce((a, b) => a + b, 0) / vals.length;
    const color  = avgSev >= 3 ? T.critical : avgSev >= 2 ? T.warning : T.blue;
    return { sparklinePath: pts, sparklineColor: color, yMax: max };
  }, [points]);

  const durationLabel = (() => {
    if (!dateRange[0] || !dateRange[1]) return '';
    const ms = dateRange[1].getTime() - dateRange[0].getTime();
    if (ms < 3600000) return `${Math.round(ms / 60000)} min`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)} h`;
    return `${(ms / 86400000).toFixed(1)} d`;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              IoTDB Trend Viewer
            </h1>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '3px 10px', borderRadius: '20px',
              background: T.blueLight, border: `1px solid ${T.blueMuted}`,
              fontSize: '11px', fontWeight: 700, color: T.blue,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Historian BFF
            </span>
          </div>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: 0 }}>
            Decimated time-series from Apache IoTDB via <code style={{ fontSize: '12px', background: T.bg, padding: '1px 5px', borderRadius: '4px' }}>/api/hist/trend</code>
          </p>
        </div>
      </div>

      {/* ── Query toolbar ───────────────────────────────────── */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '20px 22px', boxShadow: T.shadow,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>

          <FilterField label="IoTDB Series Path">
            <input type="text" className="ob-input"
              value={series} onChange={e => setSeries(e.target.value)}
              placeholder="root.ams.site1.alarms.*"
              style={{ width: '340px' }}
            />
          </FilterField>

          <FilterField label="Time Range">
            <DatePicker
              selectsRange startDate={dateRange[0]} endDate={dateRange[1]}
              onChange={(u) => setDateRange(u as [Date | null, Date | null])}
              showTimeSelect timeFormat="HH:mm" timeIntervals={15}
              dateFormat="yyyy-MM-dd HH:mm" className="ob-input" wrapperClassName="date-picker-wrapper"
            />
          </FilterField>

          <button onClick={() => void runQuery()} disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              background: T.blue, color: '#fff', border: 'none', borderRadius: T.radiusSm,
              padding: '9px 22px', fontSize: '13px', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1, transition: 'opacity 140ms ease', alignSelf: 'flex-end',
              boxShadow: '0 1px 4px rgba(49,89,143,0.25)',
            }}
            onMouseEnter={e => !loading && (e.currentTarget.style.background = T.blueMid)}
            onMouseLeave={e => (e.currentTarget.style.background = T.blue)}
          >
            {loading
              ? <><span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Querying…</>
              : <>▶ Fetch Trend</>}
          </button>

          {points.length > 0 && (
            <div style={{
              marginLeft: 'auto', alignSelf: 'flex-end',
              display: 'flex', gap: '8px',
            }}>
              <Badge label="Points" value={String(points.length)} />
              {durationLabel && <Badge label="Window" value={durationLabel} />}
            </div>
          )}
        </div>

        {/* Quick presets */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${T.borderLight}` }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center', marginRight: '4px' }}>Quick select:</span>
          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => setDateRange([new Date(Date.now() - p.ms), new Date()])}
              style={{
                padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                border: `1.5px solid ${T.border}`, borderRadius: '20px',
                background: T.card, color: T.textSecondary, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 130ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.blueLight; e.currentTarget.style.color = T.blue; e.currentTarget.style.borderColor = T.blueMuted; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.card; e.currentTarget.style.color = T.textSecondary; e.currentTarget.style.borderColor = T.border; }}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div style={{ padding: '12px 16px', background: T.criticalBg, border: `1px solid ${T.criticalBorder}`, borderRadius: T.radiusSm, color: T.critical, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700 }}>Query error:</span> {error}
        </div>
      )}

      {/* ── Sparkline chart ─────────────────────────────────── */}
      {sparklinePath && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: '20px 22px', boxShadow: T.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '3px', height: '18px', background: sparklineColor, borderRadius: '2px' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Severity over time — decimated avg · max severity {yMax}
            </span>
          </div>
          <svg width="100%" viewBox="0 0 800 80" preserveAspectRatio="none"
            style={{ display: 'block', height: '80px', borderRadius: '4px' }}>
            {/* Zero line */}
            <line x1="0" y1="79" x2="800" y2="79" stroke={T.borderLight} strokeWidth="1" />
            {/* Fill area */}
            <polygon
              points={`0,80 ${sparklinePath} 800,80`}
              fill={sparklineColor}
              opacity="0.08"
            />
            {/* Line */}
            <polyline
              points={sparklinePath}
              fill="none"
              stroke={sparklineColor}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          {/* Time axis labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            {[dateRange[0], dateRange[1]].map((d, i) => (
              <span key={i} style={{ fontSize: '10.5px', color: T.textMuted, fontFamily: 'monospace' }}>
                {d?.toLocaleString('en-GB')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Summary stats ───────────────────────────────────── */}
      {points.length > 0 && (() => {
        const sevs = points.map(p => typeof p.severity === 'number' ? p.severity : Number(p.severity) || 0).filter(v => v > 0);
        const maxSev = sevs.length ? Math.max(...sevs) : 0;
        const avgSev = sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0;
        const states: Record<string, number> = {};
        for (const p of points) {
          const st = String(p.state ?? 'UNKNOWN');
          states[st] = (states[st] ?? 0) + 1;
        }
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <SummaryKpi label="Total Points" value={String(points.length)} sub="returned by BFF" color={T.blue} />
            <SummaryKpi label="Max Severity" value={String(maxSev)} sub="in window" color={SEVERITY_COLOR[maxSev] ?? T.textPrimary} />
            <SummaryKpi label="Avg Severity" value={avgSev > 0 ? avgSev.toFixed(1) : '—'} sub="across points" color={T.textPrimary} />
            <SummaryKpi label="Distinct States" value={String(Object.keys(states).length)} sub={Object.keys(states).slice(0, 3).join(', ')} color={T.textPrimary} />
          </div>
        );
      })()}

      {/* ── Data table ──────────────────────────────────────── */}
      {points.length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: 'hidden', boxShadow: T.shadow }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 20px', borderBottom: `1.5px solid ${T.border}`,
          }}>
            <div style={{ width: '3px', height: '18px', background: T.blue, borderRadius: '2px' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: T.textPrimary }}>Trend Data Points</span>
            <span style={{ fontSize: '11px', color: T.textMuted, marginLeft: 'auto' }}>
              {points.length > 200 ? `Showing first 200 of ${points.length}` : `${points.length} points`}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  {['Timestamp', ...Object.keys(points[0] ?? {}).filter(k => k !== 'ts')].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: '11px', fontWeight: 700, color: T.textMuted,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderBottom: `1.5px solid ${T.border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points.slice(0, 200).map((pt, i) => {
                  const sev = typeof pt.severity === 'number' ? pt.severity : Number(pt.severity) || 0;
                  const rowAccent = sev >= 3 ? T.criticalBg : sev >= 2 ? T.warningBg : undefined;
                  return (
                    <tr key={i} style={{
                      borderBottom: `1px solid ${T.borderLight}`,
                      background: rowAccent ?? (i % 2 === 0 ? T.card : T.bg),
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
                      onMouseLeave={e => (e.currentTarget.style.background = rowAccent ?? (i % 2 === 0 ? T.card : T.bg))}
                    >
                      <td style={{ padding: '8px 16px', color: T.textSecondary, fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {new Date(pt.ts).toLocaleString('en-GB')}
                      </td>
                      {Object.entries(pt).filter(([k]) => k !== 'ts').map(([k, v]) => (
                        <td key={k} style={{ padding: '8px 16px', color: k === 'severity' && sev >= 2 ? (SEVERITY_COLOR[sev] ?? T.textPrimary) : T.textPrimary, fontWeight: k === 'severity' && sev >= 2 ? 700 : 400 }}>
                          {v === null || v === undefined ? <span style={{ color: T.textMuted }}>—</span> : String(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────── */}
      {!loading && !error && queried && points.length === 0 && (
        <div style={{ padding: '48px', textAlign: 'center', background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>📈</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: T.textSecondary }}>No data found</div>
          <div style={{ fontSize: '13px', color: T.textMuted, marginTop: '6px' }}>No IoTDB records in the selected window for the given series path.</div>
        </div>
      )}

      {!loading && !error && !queried && (
        <div style={{ padding: '48px', textAlign: 'center', background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>📈</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: T.textSecondary }}>Enter a series path and click Fetch Trend</div>
          <div style={{ fontSize: '13px', color: T.textMuted, marginTop: '6px' }}>
            Example: <code style={{ background: T.bg, padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>root.ams.site1.alarms.*</code>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Small shared helpers ─────────────────────────────────── */

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    {children}
  </label>
);

const Badge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 12px', background: T.blueLight, border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
  }}>
    <span style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    <span style={{ fontSize: '16px', fontWeight: 700, color: T.blue, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </div>
);

const SummaryKpi: React.FC<{ label: string; value: string; sub: string; color: string }> = ({ label, value, sub, color }) => (
  <div style={{
    background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
    padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: T.shadow,
  }}>
    <span style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
    <span style={{ fontSize: '28px', fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    <span style={{ fontSize: '11.5px', color: T.textSecondary, lineHeight: 1.3 }}>{sub}</span>
  </div>
);

export default IoTDBTrendViewer;
