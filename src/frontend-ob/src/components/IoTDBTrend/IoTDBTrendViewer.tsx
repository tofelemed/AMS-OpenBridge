'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useMqttStore, type TrendPoint } from '../../store/mqttStore';
import { formatTimestampMs } from '../../utils/time';
import { discoverIotdbDevicePaths, iotdbAlarmPath } from '../../utils/iotdbPaths';

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


const CHART_BUCKETS = 200;
const PAGE_SIZE = 50;

const PRESETS = [
  { label: 'Last 1 h',  ms: 60 * 60 * 1000 },
  { label: 'Last 6 h',  ms: 6  * 60 * 60 * 1000 },
  { label: 'Last 24 h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7 d',  ms: 7  * 24 * 60 * 60 * 1000 },
];

const TABLE_COLUMNS: { key: string; label: string; align?: 'left' | 'right' }[] = [
  { key: 'ts',             label: 'Timestamp' },
  { key: 'severity',       label: 'Severity', align: 'right' },
  { key: 'state',          label: 'State' },
  { key: 'priority',       label: 'Priority' },
  { key: 'ack_status',     label: 'Ack' },
  { key: 'condition_name', label: 'Condition' },
  { key: 'source_name',    label: 'Source' },
];

function severityColor(sev: number): string {
  if (sev >= 800) return T.critical;
  if (sev >= 600) return T.caution;
  if (sev >= 400) return T.warning;
  return T.blue;
}

function cellValue(pt: TrendPoint, key: string): string {
  if (key === 'ts') return formatTimestampMs(pt.ts);
  const v = pt[key];
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'ack_status') {
    if (v === true || v === 1 || v === 'true') return 'Yes';
    if (v === false || v === 0 || v === 'false') return 'No';
  }
  return String(v);
}

const IoTDBTrendViewer: React.FC = () => {
  const [searchParams] = useSearchParams();
  const fetchTrend = useMqttStore(s => s.fetchTrend);
  const fetchRaw   = useMqttStore(s => s.fetchRaw);

  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [series, setSeries] = useState('');
  const [fromAlarmId, setFromAlarmId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(Date.now() - 6 * 60 * 60 * 1000), new Date(),
  ]);
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chartPoints, setChartPoints] = useState<TrendPoint[]>([]);
  const [tablePoints, setTablePoints] = useState<TrendPoint[]>([]);
  const [tableOffset, setTableOffset] = useState(0);
  const [hasMore, setHasMore]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [queried, setQueried]       = useState(false);

  // FE-03: each query owns an AbortController; a new query (tag/range change) aborts
  // the previous one, so a slow stale response can never overwrite a newer result.
  // This viewer previously had NO guard at all.
  const queryAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => queryAbortRef.current?.abort(), []);

  const executeQuery = useCallback(async (path: string, start: Date, end: Date) => {
    if (path.includes('*')) {
      setError('Select a concrete alarm device path — wildcards are not supported for IoTDB queries.');
      return;
    }

    queryAbortRef.current?.abort();
    const ac = new AbortController();
    queryAbortRef.current = ac;

    setLoading(true);
    setError(null);
    setTableOffset(0);
    try {
      const [trend, raw] = await Promise.all([
        fetchTrend(path, start, end, CHART_BUCKETS, undefined, ac.signal),
        fetchRaw(path, start, end, PAGE_SIZE, 0, ac.signal),
      ]);
      if (ac.signal.aborted) return; // superseded — a newer query owns the UI now
      setChartPoints(trend);
      setTablePoints(raw.points);
      setHasMore(raw.hasMore);
      setTableOffset(raw.points.length);
      setQueried(true);
    } catch (e) {
      if (ac.signal.aborted) return; // cancellation is not an error to display
      setError(String(e));
      setChartPoints([]);
      setTablePoints([]);
      setHasMore(false);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [fetchTrend, fetchRaw]);

  const runQuery = useCallback(async () => {
    const [start, end] = dateRange;
    const path = series.trim();
    if (!start || !end || !path) return;
    await executeQuery(path, start, end);
  }, [dateRange, series, executeQuery]);

  useEffect(() => {
    void (async () => {
      const discovered = await discoverIotdbDevicePaths();

      const urlSeries = searchParams.get('series')?.trim() ?? '';
      const urlAlarmId = searchParams.get('alarmId')?.trim() ?? '';
      const hours = Math.max(1, Number(searchParams.get('hours') ?? '6') || 6);
      const autoFetch = searchParams.get('auto') === '1';

      let targetSeries = urlSeries;
      if (!targetSeries && urlAlarmId) {
        targetSeries = iotdbAlarmPath(urlAlarmId);
        setFromAlarmId(urlAlarmId);
      }

      const merged = new Set(discovered);
      if (targetSeries) merged.add(targetSeries);
      const options = [...merged].sort();
      setSeriesOptions(options);

      const start = new Date(Date.now() - hours * 3600000);
      const end = new Date();

      if (targetSeries) {
        setSeries(targetSeries);
        setDateRange([start, end]);
        if (autoFetch) await executeQuery(targetSeries, start, end);
      } else if (options.length > 0) {
        setSeries(options[0]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    const [start, end] = dateRange;
    const path = series.trim();
    if (!start || !end || !path || !hasMore || loadingMore) return;

    setLoadingMore(true);
    // FE-03: pagination rides the active query's controller — a new query aborts it too.
    const ac = queryAbortRef.current;
    try {
      const raw = await fetchRaw(path, start, end, PAGE_SIZE, tableOffset, ac?.signal);
      if (ac?.signal.aborted) return;
      setTablePoints(prev => [...prev, ...raw.points]);
      setHasMore(raw.hasMore);
      setTableOffset(prev => prev + raw.points.length);
    } catch (e) {
      if (ac?.signal.aborted) return;
      setError(String(e));
    } finally {
      if (!ac?.signal.aborted) setLoadingMore(false);
    }
  }, [dateRange, series, hasMore, loadingMore, tableOffset, fetchRaw]);

  const { sparklinePath, sparklineColor, yMax } = useMemo(() => {
    const vals = chartPoints
      .map(p => Number(p.severity))
      .filter(v => !Number.isNaN(v) && v > 0);
    if (vals.length < 2) return { sparklinePath: null, sparklineColor: T.blue, yMax: 1 };
    const W = 800, H = 80;
    const max = Math.max(...vals, 1);
    const xs  = vals.map((_, i) => (i / (vals.length - 1)) * W);
    const ys  = vals.map(v => H - (v / max) * (H - 6));
    const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const avgSev = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { sparklinePath: pts, sparklineColor: severityColor(avgSev), yMax: max };
  }, [chartPoints]);

  const durationLabel = (() => {
    if (!dateRange[0] || !dateRange[1]) return '';
    const ms = dateRange[1].getTime() - dateRange[0].getTime();
    if (ms < 3600000) return `${Math.round(ms / 60000)} min`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)} h`;
    return `${(ms / 86400000).toFixed(1)} d`;
  })();

  const stats = useMemo(() => {
    const sevs = tablePoints.map(p => Number(p.severity)).filter(v => !Number.isNaN(v) && v > 0);
    const states: Record<string, number> = {};
    for (const p of tablePoints) {
      const st = String(p.state ?? 'UNKNOWN');
      states[st] = (states[st] ?? 0) + 1;
    }
    return {
      maxSev: sevs.length ? Math.max(...sevs) : 0,
      avgSev: sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0,
      states,
    };
  }, [tablePoints]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em' }}>
              IoTDB Trend Viewer
            </h1>
            <span style={{
              padding: '3px 10px', borderRadius: '20px',
              background: T.blueLight, border: `1px solid ${T.blueMuted}`,
              fontSize: '11px', fontWeight: 700, color: T.blue, textTransform: 'uppercase',
            }}>
              Historian BFF
            </span>
          </div>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: 0, maxWidth: '720px', lineHeight: 1.5 }}>
            Chart uses <strong>/trend</strong> (time-bucket averages, max {CHART_BUCKETS} points).
            Table uses <strong>/raw</strong> (individual IoTDB records, {PAGE_SIZE} per page).
            Point count reflects the selected time window — not live MQTT alarm count.
          </p>
        </div>
      </div>

      {fromAlarmId && (
        <div style={{
          padding: '10px 16px', background: T.blueLight, border: `1px solid ${T.blueMuted}`,
          borderRadius: T.radiusSm, fontSize: '13px', color: T.blue,
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 700 }}>From Live Events</span>
          <span style={{ color: T.textSecondary }}>
            Alarm <code style={{ background: T.card, padding: '1px 6px', borderRadius: '4px' }}>{fromAlarmId}</code>
            → IoTDB <code style={{ background: T.card, padding: '1px 6px', borderRadius: '4px' }}>{series}</code>
          </span>
        </div>
      )}

      {/* Query toolbar */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '18px 20px', boxShadow: T.shadow,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
          <FilterField label="Alarm device path">
            {seriesOptions.length > 0 ? (
              <select className="ob-input" value={series} onChange={e => setSeries(e.target.value)}
                style={{ width: 'min(420px, 100%)', minWidth: '280px' }}>
                {seriesOptions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input type="text" className="ob-input" value={series}
                onChange={e => setSeries(e.target.value)}
                placeholder="root.ams.site1.alarms.&lt;alarm_id&gt;"
                style={{ width: 'min(420px, 100%)', minWidth: '280px' }}
              />
            )}
          </FilterField>

          <FilterField label="Time range">
            <DatePicker
              selectsRange startDate={dateRange[0]} endDate={dateRange[1]}
              onChange={(u) => setDateRange(u as [Date | null, Date | null])}
              showTimeSelect timeFormat="HH:mm" timeIntervals={15}
              dateFormat="yyyy-MM-dd HH:mm" className="ob-input" wrapperClassName="date-picker-wrapper"
            />
          </FilterField>

          <button type="button" onClick={() => void runQuery()} disabled={loading || !series.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              background: T.blue, color: '#fff', border: 'none', borderRadius: T.radiusSm,
              padding: '9px 22px', fontSize: '13px', fontWeight: 600,
              cursor: loading || !series.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1, alignSelf: 'flex-end',
            }}>
            {loading ? 'Querying…' : '▶ Fetch'}
          </button>

          {queried && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignSelf: 'flex-end', flexWrap: 'wrap' }}>
              <Badge label="Chart buckets" value={String(chartPoints.length)} hint={`≤ ${CHART_BUCKETS} decimated`} />
              <Badge label="Table rows" value={String(tablePoints.length)} hint={hasMore ? 'more available' : 'loaded'} />
              {durationLabel && <Badge label="Window" value={durationLabel} />}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${T.borderLight}`, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', alignSelf: 'center' }}>Quick:</span>
          {PRESETS.map(p => (
            <button key={p.label} type="button"
              onClick={() => setDateRange([new Date(Date.now() - p.ms), new Date()])}
              style={{
                padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                border: `1.5px solid ${T.border}`, borderRadius: '20px',
                background: T.card, color: T.textSecondary, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {p.label}
            </button>
          ))}
          {seriesOptions.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: T.textMuted, alignSelf: 'center' }}>
              {seriesOptions.length} device path{seriesOptions.length !== 1 ? 's' : ''} in IoTDB
            </span>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', background: T.criticalBg, border: `1px solid ${T.criticalBorder}`,
          borderRadius: T.radiusSm, color: T.critical, fontSize: '13px',
        }}>
          <strong>Query error:</strong> {error}
        </div>
      )}

      {sparklinePath && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: '18px 20px', boxShadow: T.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '3px', height: '18px', background: sparklineColor, borderRadius: '2px' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Severity trend — avg per time bucket · peak {yMax}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: T.textMuted }}>
              {chartPoints.length} bucket{chartPoints.length !== 1 ? 's' : ''} (not alarm events)
            </span>
          </div>
          <svg width="100%" viewBox="0 0 800 80" preserveAspectRatio="none" style={{ display: 'block', height: '72px' }}>
            <line x1="0" y1="79" x2="800" y2="79" stroke={T.borderLight} strokeWidth="1" />
            <polygon points={`0,80 ${sparklinePath} 800,80`} fill={sparklineColor} opacity="0.08" />
            <polyline points={sparklinePath} fill="none" stroke={sparklineColor} strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            {[dateRange[0], dateRange[1]].map((d, i) => (
              <span key={i} style={{ fontSize: '10.5px', color: T.textMuted, fontFamily: 'monospace' }}>
                {d?.toLocaleString('en-GB')}
              </span>
            ))}
          </div>
        </div>
      )}

      {tablePoints.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <SummaryKpi label="Loaded rows" value={String(tablePoints.length)} sub={hasMore ? 'scroll for more' : 'complete'} color={T.blue} />
            <SummaryKpi label="Max severity" value={String(stats.maxSev || '—')} sub="in loaded rows" color={severityColor(stats.maxSev)} />
            <SummaryKpi label="Avg severity" value={stats.avgSev > 0 ? stats.avgSev.toFixed(0) : '—'} sub="loaded sample" color={T.textPrimary} />
            <SummaryKpi label="States" value={String(Object.keys(stats.states).length)} sub={Object.keys(stats.states).slice(0, 2).join(', ') || '—'} color={T.textPrimary} />
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: 'hidden', boxShadow: T.shadow }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 18px', borderBottom: `1.5px solid ${T.border}`, background: T.bg,
            }}>
              <div style={{ width: '3px', height: '18px', background: T.blue, borderRadius: '2px' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: T.textPrimary }}>Trend Data Points</span>
              <span style={{ fontSize: '11px', color: T.textMuted, marginLeft: 'auto' }}>
                Raw IoTDB records · newest first · {PAGE_SIZE} per page
              </span>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: T.bg }}>
                    {TABLE_COLUMNS.map(col => (
                      <th key={col.key} style={{
                        padding: '9px 14px', textAlign: col.align ?? 'left',
                        fontSize: '10px', fontWeight: 700, color: T.textMuted,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        borderBottom: `2px solid ${T.border}`, whiteSpace: 'nowrap',
                      }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tablePoints.map((pt, i) => {
                    const sev = Number(pt.severity) || 0;
                    const rowBg = sev >= 800 ? T.criticalBg : sev >= 600 ? T.warningBg : i % 2 === 0 ? T.card : T.bg;
                    return (
                      <tr key={`${pt.ts}-${i}`} style={{ borderBottom: `1px solid ${T.borderLight}`, background: rowBg }}>
                        {TABLE_COLUMNS.map(col => {
                          const isSev = col.key === 'severity';
                          const isTs  = col.key === 'ts';
                          return (
                            <td key={col.key} style={{
                              padding: '8px 14px',
                              textAlign: col.align ?? 'left',
                              color: isSev && sev >= 600 ? severityColor(sev) : isTs ? T.textSecondary : T.textPrimary,
                              fontFamily: isTs || col.key === 'source_name' ? 'monospace' : 'inherit',
                              fontSize: isTs ? '11.5px' : '12px',
                              fontWeight: isSev && sev >= 600 ? 700 : 400,
                              maxWidth: col.key === 'condition_name' || col.key === 'source_name' ? '200px' : undefined,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {cellValue(pt, col.key)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(hasMore || loadingMore) && (
              <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.borderLight}`, textAlign: 'center', background: T.bg }}>
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore || !hasMore}
                  style={{
                    padding: '8px 20px', fontSize: '12px', fontWeight: 600,
                    border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
                    background: T.blueLight, color: T.blue, cursor: loadingMore ? 'wait' : 'pointer',
                    fontFamily: 'inherit', opacity: hasMore ? 1 : 0.5,
                  }}>
                  {loadingMore ? 'Loading…' : `Load next ${PAGE_SIZE} records`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !error && queried && tablePoints.length === 0 && chartPoints.length === 0 && (
        <EmptyState title="No data in this window" sub={`No IoTDB records for ${series} between the selected dates.`} />
      )}

      {!loading && !error && !queried && (
        <EmptyState
          title="Select an alarm device and click Fetch"
          sub={seriesOptions.length === 0
            ? 'No devices found in IoTDB yet — run the E2E feed or live_events_feed.py first.'
            : `${seriesOptions.length} device path(s) available from IoTDB.`}
        />
      )}
    </div>
  );
};

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    {children}
  </label>
);

const Badge: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '6px 12px', background: T.blueLight, border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm,
  }}>
    <span style={{ fontSize: '9px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>{label}</span>
    <span style={{ fontSize: '16px', fontWeight: 700, color: T.blue, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    {hint && <span style={{ fontSize: '10px', color: T.textMuted }}>{hint}</span>}
  </div>
);

const SummaryKpi: React.FC<{ label: string; value: string; sub: string; color: string }> = ({ label, value, sub, color }) => (
  <div style={{
    background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
    padding: '14px 16px', boxShadow: T.shadow,
  }}>
    <div style={{ fontSize: '10px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '26px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: '11px', color: T.textSecondary, marginTop: '4px' }}>{sub}</div>
  </div>
);

const EmptyState: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <div style={{ padding: '48px', textAlign: 'center', background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, boxShadow: T.shadow }}>
    <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>📈</div>
    <div style={{ fontSize: '15px', fontWeight: 600, color: T.textSecondary }}>{title}</div>
    <div style={{ fontSize: '13px', color: T.textMuted, marginTop: '6px' }}>{sub}</div>
  </div>
);

export default IoTDBTrendViewer;
