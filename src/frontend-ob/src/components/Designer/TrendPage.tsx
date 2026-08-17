'use client';

// Phase J — the dedicated, deep-linkable trend route: /trend?tags=<uns,path,list>&range=15m
// Same TrendCore engine as the dialog and the canvas symbol; the pen set comes from the URL, so the
// page is shareable/bookmarkable.
//
// Custom window (?from=&to=, ISO): pins the chart to an explicit historical range
// via TrendCore's controlledWindow — the same prop the canvas TrendChart symbol
// already drives. Before this, the page offered preset ranges only, and reaching
// "last Tuesday 14:00–16:00" meant stepping backwards half a window at a time;
// for historical analysis the explicit range IS the feature. While pinned,
// TrendCore's own time bar is hidden (its range/step/now controls act on the
// internal window, which a controlled window overrides — dead buttons lie) and
// the page shows From/To inputs plus a Live button that returns to presets.
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import TrendCore, { type PenSpec, RANGES } from './TrendCore';
import './Designer.css';

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const TrendPage: React.FC = () => {
  const [params, setParams] = useSearchParams();

  const pens: PenSpec[] = useMemo(() => {
    // Dedupe: two identical tags in the URL produced two pens with the same path — duplicate React
    // keys, both reading the same history, and removing one removed both (onRemovePen filters by path).
    const tags = [...new Set((params.get('tags') ?? '').split(',').map(t => t.trim()).filter(Boolean))];
    return tags.map(path => ({ path, label: path.split('/').pop() ?? path }));
  }, [params]);

  const initialRangeMs = useMemo(() => {
    const r = params.get('range');
    return RANGES.find(x => x.label === r)?.ms ?? 15 * 60_000;
  }, [params]);

  // ── Custom window (?from=&to=) ────────────────────────────────────────────
  const window = useMemo(() => {
    const f = new Date(params.get('from') ?? '');
    const t = new Date(params.get('to') ?? '');
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || t <= f) return null;
    return { start: f.getTime(), end: t.getTime(), live: false };
  }, [params]);

  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  // Drafts follow the applied window (deep links, Back/Forward) — inputs showing
  // a different range than the chart describe a window that is not on screen.
  useEffect(() => {
    setDraftFrom(window ? toLocalInput(new Date(window.start)) : '');
    setDraftTo(window ? toLocalInput(new Date(window.end)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the instants; the memo re-mints objects per params change
  }, [window?.start, window?.end]);

  const applyWindow = () => {
    const f = new Date(draftFrom); const t = new Date(draftTo);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) {
      setRangeError('Enter both dates.');
      return;
    }
    if (t <= f) {
      setRangeError('"To" must be after "From".');
      return;
    }
    setRangeError(null);
    setParams(p => {
      p.set('from', f.toISOString());
      p.set('to', t.toISOString());
      return p;
    }, { replace: true });
  };

  const backToLive = () => {
    setRangeError(null);
    setParams(p => { p.delete('from'); p.delete('to'); return p; }, { replace: true });
  };

  const removePen = (path: string) => {
    const next = pens.filter(p => p.path !== path).map(p => p.path);
    const q = new URLSearchParams(params);
    q.set('tags', next.join(','));
    setParams(q, { replace: true });
  };

  return (
    <div className="trend-page" data-testid="trend-page">
      <div className="trend-page__head">
        <span className="trend-page__title">Trend</span>
        <label className="trend-page__field">
          <span>From</span>
          <input className="ob-input" type="datetime-local" value={draftFrom}
            data-testid="trend-from"
            onChange={e => setDraftFrom(e.target.value)} />
        </label>
        <label className="trend-page__field">
          <span>To</span>
          <input className="ob-input" type="datetime-local" value={draftTo}
            data-testid="trend-to"
            onChange={e => setDraftTo(e.target.value)} />
        </label>
        <ObcButton variant={window ? 'raised' : 'normal'} onClick={applyWindow}>
          Apply window
        </ObcButton>
        {window && (
          <ObcButton variant="normal" onClick={backToLive}>Live ›</ObcButton>
        )}
        {rangeError && <span className="trend-page__error" role="alert">{rangeError}</span>}
        <span className="trend-dialog__spacer" />
        <span className="trend-core__clock" data-testid="trend-page-mode">
          {window ? 'PINNED WINDOW' : 'LIVE'}
        </span>
        <span className="trend-core__clock" data-testid="trend-page-tags">{pens.length} pen{pens.length === 1 ? '' : 's'}</span>
      </div>
      <div className="trend-page__chart">
        <TrendCore
          pens={pens}
          initialRangeMs={initialRangeMs}
          onRemovePen={removePen}
          controlledWindow={window}
          // TrendCore's bar controls the INTERNAL window, which a controlled
          // window overrides — hiding it beats showing dead range/step buttons.
          showTimeBar={!window}
        />
      </div>
    </div>
  );
};

export default TrendPage;
