'use client';

// Phase J — the dedicated, deep-linkable trend route: /trend?tags=<uns,path,list>&range=15m
// Same TrendCore engine as the dialog and the canvas symbol; the pen set comes from the URL, so the
// page is shareable/bookmarkable.
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import TrendCore, { type PenSpec, RANGES } from './TrendCore';
import './Designer.css';

export const TrendPage: React.FC = () => {
  const [params, setParams] = useSearchParams();

  const pens: PenSpec[] = useMemo(() => {
    const tags = (params.get('tags') ?? '').split(',').map(t => t.trim()).filter(Boolean);
    return tags.map(path => ({ path, label: path.split('/').pop() ?? path }));
  }, [params]);

  const initialRangeMs = useMemo(() => {
    const r = params.get('range');
    return RANGES.find(x => x.label === r)?.ms ?? 15 * 60_000;
  }, [params]);

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
        <span className="trend-dialog__spacer" />
        <span className="trend-core__clock" data-testid="trend-page-tags">{pens.length} pen{pens.length === 1 ? '' : 's'}</span>
      </div>
      <div className="trend-page__chart">
        <TrendCore pens={pens} initialRangeMs={initialRangeMs} onRemovePen={removePen} />
      </div>
    </div>
  );
};

export default TrendPage;
