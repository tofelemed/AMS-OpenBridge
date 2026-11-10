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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import TrendCore, { type PenSpec, RANGES } from './TrendCore';
import { LoopBand } from '../Cpm/context/LoopBand';
import { QueryError, WorkspaceHeader } from '../Cpm/shared';
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
  loading?: boolean;
  /** The loop list failed to load: say so, never "Loop not found". */
  loadError?: { error: unknown; retry: () => void };
}

const TrendView: React.FC<ViewProps> = ({ loops, loading, loadError }) => {
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
  const roles = useMemo(() => rolesOf(params.get('roles')), [params]);
  const hasTags = useMemo(() => (loop ? loopPens(loop).length > 0 : false), [loop]);
  const fromLoop = useMemo(() => (loop ? loopPens(loop, roles) : []), [loop, roles]);

  const pens: PenSpec[] = useMemo(() => {
    if (tagPaths.length > 0) {
      return tagPaths.map(path => ({
        path, label: path.split('/').pop() ?? path,
        ...(isSetpointTag(path) ? { lineStyle: 'dashed' as const } : {}),
      }));
    }
    return penSpecsOf(fromLoop);
  }, [tagPaths, fromLoop]);

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
    const q = new URLSearchParams(params);
    if (tagPaths.length === 0 && loop) {
      // A loop-driven chart stays loop-driven, so role colours and the SP dash hold. No roles left reads `none`: empty, not all four.
      const left = fromLoop.filter(p => p.tag !== path).map(p => p.role);
      q.set('roles', left.length > 0 ? left.join(',') : 'none');
    } else {
      const next = tagPaths.filter(t => t !== path);
      if (next.length === 0 && loop) { q.delete('tags'); q.set('roles', 'none'); } else q.set('tags', next.join(','));
    }
    setParams(q, { replace: true });
  };

  // A chosen loop replaces the pens; the window and range stay.
  const chooseLoop = (id: string) => setParams(p => {
    p.set('loop', id); p.delete('tags'); p.delete('roles');
    return p;
  });

  // LIVE only while samples arrive: the newest one is recent against the live range (10 % of it, at least a minute).
  const [fresh, setFresh] = useState(false);
  const onSampleAge = useCallback((age: number | null, rangeMs: number) => {
    setFresh(age != null && age <= Math.max(60_000, rangeMs / 10));
  }, []);

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
      {window && <span className="trend-core__clock" data-testid="trend-page-mode">PINNED WINDOW</span>}
    </>
  );

  const noTags = !!loop && tagPaths.length === 0 && !hasTags;
  const notFound = canPick && !!loopId && !loop && !loading && !loadError;

  return (
    <div className="cpm-screen trend-page" data-testid="trend-page">
      <WorkspaceHeader eyebrow="Engineering" title="Trend" />
      {canPick ? (
        <LoopBand
          loopId={loopId}
          onLoop={chooseLoop}
          end={loopId ? <ObcButton variant="flat" onClick={() => navigate(explorerHref(loop?.loopId ?? loopId))}>Open loop {'↗'}</ObcButton> : undefined}
        >
          {controls}
        </LoopBand>
      ) : (
        <div className="trend-page__head">{controls}</div>
      )}
      <div className="trend-page__chart">
        {loadError && <QueryError title="Loops unavailable" error={loadError.error} retry={loadError.retry} />}
        {notFound && <p className="trend-page__empty" role="status">Loop not found</p>}
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
          onSampleAge={onSampleAge}
          sampleFresh={fresh}
          // With the selector the band says Choose a loop; without it the legend keeps its old words.
          emptyLegendText={canPick ? '' : undefined}
        />
      </div>
    </div>
  );
};

/** The loop list is read only with analytics.view; the page itself needs only historian.view. */
const WithLoops: React.FC = () => {
  const q = useCpmLoops();
  return <TrendView loops={q.data?.loops ?? []} loading={q.isLoading}
    loadError={q.isError ? { error: q.error, retry: () => void q.refetch() } : undefined} />;
};

export const TrendPage: React.FC = () => {
  const canPick = useAuthStore(s => s.hasPermission('analytics.view'));
  return canPick ? <WithLoops /> : <TrendView />;
};

export default TrendPage;
