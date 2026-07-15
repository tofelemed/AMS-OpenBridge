import React, { useEffect, useState } from 'react';
import { useDisplayTimeStore } from '../../store/timeStore';

const PRESETS: { label: string; ms: number }[] = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '8h', ms: 8 * 60 * 60_000 },
  { label: '1d', ms: 24 * 60 * 60_000 },
  { label: '1w', ms: 7 * 24 * 60 * 60_000 },
];

const fmt = (ms: number) =>
  ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const btn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, fontWeight: 600,
  color: 'var(--element-active-color, #f1f5f9)',
  background: 'var(--container-section-color, #262626)',
  border: '1px solid var(--normal-enabled-border-color, #6b6b6b)',
  borderRadius: 4, cursor: 'pointer',
};
const field: React.CSSProperties = {
  width: 92, padding: '4px 6px', fontSize: 12, fontFamily: 'monospace',
  color: 'var(--element-active-color, #f1f5f9)',
  background: 'var(--container-background-color, #1f1f1f)',
  border: '1px solid var(--normal-enabled-border-color, #6b6b6b)', borderRadius: 4,
};

/**
 * Display time bar (checklist K1–K7). Reads/writes the shared display time context so every
 * time-aware symbol follows one window. Relative expressions (`*-8h`, `t`, `y`) validate via the
 * standalone parser; live mode auto-advances on a 2 s tick.
 */
export const TimeBar: React.FC = () => {
  const startExpr = useDisplayTimeStore(s => s.startExpr);
  const endExpr = useDisplayTimeStore(s => s.endExpr);
  const start = useDisplayTimeStore(s => s.start);
  const end = useDisplayTimeStore(s => s.end);
  const live = useDisplayTimeStore(s => s.live);
  const error = useDisplayTimeStore(s => s.error);
  const setRange = useDisplayTimeStore(s => s.setRange);
  const setDurationMs = useDisplayTimeStore(s => s.setDurationMs);
  const snapToNow = useDisplayTimeStore(s => s.snapToNow);
  const shift = useDisplayTimeStore(s => s.shift);
  const revert = useDisplayTimeStore(s => s.revert);
  const tick = useDisplayTimeStore(s => s.tick);

  const [s, setS] = useState(startExpr);
  const [e, setE] = useState(endExpr);
  useEffect(() => setS(startExpr), [startExpr]);
  useEffect(() => setE(endExpr), [endExpr]);

  // Live mode: advance the window on a bounded interval.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => tick(), 2000);
    return () => window.clearInterval(id);
  }, [live, tick]);

  const apply = () => setRange(s.trim(), e.trim());
  const onKey = (ev: React.KeyboardEvent) => { if (ev.key === 'Enter') apply(); };

  return (
    <div
      className="time-bar"
      data-testid="time-bar"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '6px 12px',
        background: 'var(--container-backdrop-color, #0f0f0f)',
        borderTop: '1px solid var(--normal-enabled-border-color, #3a3a3a)',
        color: 'var(--element-active-color, #f1f5f9)',
      }}
    >
      <button style={btn} onClick={() => shift(-1)} title="Shift back by the current duration" aria-label="Shift back">‹</button>

      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
        Start
        <input style={field} data-testid="time-start" value={s} onChange={ev => setS(ev.target.value)} onBlur={apply} onKeyDown={onKey} placeholder="*-1h" />
      </label>
      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
        End
        <input style={field} data-testid="time-end" value={e} onChange={ev => setE(ev.target.value)} onBlur={apply} onKeyDown={onKey} placeholder="*" />
      </label>

      <button style={btn} onClick={() => shift(1)} title="Shift forward by the current duration" aria-label="Shift forward">›</button>

      <span style={{ width: 1, height: 18, background: 'var(--normal-enabled-border-color, #3a3a3a)' }} />

      {PRESETS.map(p => (
        <button key={p.label} style={btn} onClick={() => setDurationMs(p.ms)} title={`Last ${p.label}`}>{p.label}</button>
      ))}
      <button style={btn} data-testid="time-now" onClick={snapToNow} title="Snap end to now (live)">Now</button>
      <button style={btn} data-testid="time-revert" onClick={revert} title="Revert to the display's saved time range">Revert</button>

      <span
        data-testid="time-mode"
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 3,
          color: live ? 'var(--ams-run)' : 'var(--element-neutral-color, #949494)',
          border: `1px solid ${live ? 'var(--ams-run)' : 'var(--normal-enabled-border-color, #3a3a3a)'}`,
        }}
      >
        {live ? 'LIVE' : 'FIXED'}
      </span>

      <span style={{ fontSize: 11, color: 'var(--element-neutral-color, #949494)', fontFamily: 'monospace' }}>
        {fmt(start)} → {fmt(end)}
      </span>

      {error && (
        <span data-testid="time-error" style={{ fontSize: 11, color: 'var(--ams-crit)' }}>{error}</span>
      )}
    </div>
  );
};

export default TimeBar;
