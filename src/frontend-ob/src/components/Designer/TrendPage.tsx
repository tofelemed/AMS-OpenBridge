'use client';

// Phase J — the dedicated, deep-linkable trend route: /trend?tags=<uns,path,list>&range=15m
// Same TrendCore engine as the dialog and the canvas symbol; the pen set comes from the URL, so the
// page is shareable/bookmarkable.
//
// Task 26: /trend?loop=<id> loads that loop's PV, SP, OP and VP pens (`roles=` narrows them). Explicit
// `tags` still win, so old bookmarks and Designer links work unchanged. The selector needs analytics.view;
// without it the page is what it was (the page itself needs only historian.view).
//
// Custom window (?from=&to=, ISO): pins the chart to an explicit historical range
// via TrendCore's controlledWindow — the same prop the canvas TrendChart symbol
// already drives. While pinned, TrendCore's own time bar is hidden (its range/step/now controls act on
// the internal window, which a controlled window overrides — dead buttons lie) and the page shows
// From/To inputs plus a Live button that returns to presets.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import TrendCore, { type PenSpec, RANGES } from './TrendCore';
import { LoopBand } from '../Cpm/context/LoopBand';
import { WorkspaceHeader } from '../Cpm/shared';
import { explorerHref } from '../Cpm/cpaHref';
import { useCpmLoops } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import type { CpmLoop } from '../../api/cpmApi';
import { fromSiteInput, toSiteInput } from '../../cpa/siteTime';
import { loopPens, penSpecsOf, rolesOf } from './trend/loopPens';
import './Designer.css';

/** A setpoint pen is dashed (CD14). The URL carries no role, so the tag's measurement name decides. */
const isSetpointTag = (path: string) => /\.sp$/i.test(path);

const toLocalInput = (d: Date) => toSiteInput(d.getTime());

interface ViewProps {
  /** Every loop the user can pick from; undefined when the selector is not offered (no analytics.view). */
  loops?: CpmLoop[];
}

const TrendView: React.FC<ViewProps> = ({ loops }) => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const canPick = loops !== undefined;

  const tagPaths = useMemo(
    // Dedupe: two identical tags in the URL produced two pens with the same path — duplicate React
    // keys, both reading the same history, and removing one removed both (onRemovePen filters by path).
    () => [...new Set((params.get('tags') ?? '').split(',').map(t => t.trim()).filter(Boolean))],
    [params]);
  const loopId = params.get('loop')?.trim() || null;
  const loop = loopId ? loops?.find(l => l.loopId.toLowerCase() === loopId.toLowerCase()) : undefined;
  const fromLoop = useMemo(() => (loop ? loopPens(loop) : []), [loop]);

  const pens: PenSpec[] = useMemo(() => {
    if (tagPaths.length > 0) {
      return tagPaths.map(path => ({
        path, label: path.split('/').pop() ?? path,
        ...(isSetpointTag(path) ? { lineStyle: 'dashed' as const } : {}),
      }));
    }
    return penSpecsOf(fromLoop, rolesOf(params.get('roles')));
  }, [tagPaths, fromLoop, params]);

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
    const f = new Date(fromSiteInput(draftFrom)); const t = new Date(fromSiteInput(draftTo));
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

  // A chosen loop replaces the pens; the window and range stay.
  const chooseLoop = (id: string) => setParams(p => {
    p.set('loop', id); p.delete('tags'); p.delete('roles');
    return p;
  });
  const clearLoop = () => setParams(p => { p.delete('loop'); p.delete('tags'); p.delete('roles'); return p; });

  const controls = (
    <>
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
      {(window || pens.length > 0) && (
        <span className="trend-core__clock" data-testid="trend-page-mode">
          {window ? 'PINNED WINDOW' : 'LIVE'}
        </span>
      )}
    </>
  );

  const noTags = !!loop && tagPaths.length === 0 && fromLoop.length === 0;
  const chooseHint = canPick && pens.length === 0 && !loopId;

  return (
    <div className="cpm-screen trend-page" data-testid="trend-page">
      <WorkspaceHeader eyebrow="Engineering" title="Trend" />
      {canPick ? (
        <LoopBand
          loopId={loopId}
          onLoop={chooseLoop}
          onClear={clearLoop}
          end={loopId ? <ObcButton variant="flat" onClick={() => navigate(explorerHref(loopId))}>Open loop {'↗'}</ObcButton> : undefined}
        >
          {controls}
        </LoopBand>
      ) : (
        <div className="trend-page__head">{controls}</div>
      )}
      <div className="trend-page__chart">
        {chooseHint && <p className="trend-page__empty" role="status">Choose a loop</p>}
        {noTags && <p className="trend-page__empty" role="status">{loop.loopId} has no signal tags mapped.</p>}
        <TrendCore
          pens={pens}
          initialRangeMs={initialRangeMs}
          onRemovePen={removePen}
          controlledWindow={window}
          // TrendCore's bar controls the INTERNAL window, which a controlled
          // window overrides — hiding it beats showing dead range/step buttons.
          showTimeBar={!window}
          // CHG-080: Zoom area / Undo / Reset act on the chart, not the window — keep them when pinned
          showZoomBar={!!window}
        />
      </div>
    </div>
  );
};

/** The loop list is read only with analytics.view; the page itself needs only historian.view. */
const WithLoops: React.FC = () => {
  const q = useCpmLoops();
  return <TrendView loops={q.data?.loops ?? []} />;
};

export const TrendPage: React.FC = () => {
  const canPick = useAuthStore(s => s.hasPermission('analytics.view'));
  return canPick ? <WithLoops /> : <TrendView />;
};

export default TrendPage;
