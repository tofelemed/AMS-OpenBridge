'use client';

// Phase J — the dedicated, deep-linkable trend route: /trend?tags=<uns,path,list>&range=15m
// Same TrendCore engine as the dialog and the canvas symbol; the pen set comes from the URL, so the
// page is shareable/bookmarkable.
//
// Task 26: /trend?loop=<id> loads that loop's PV, SP, OP and VP pens (`roles=` narrows them). Explicit
// `tags` still win, so old bookmarks and Designer links work unchanged. The selector needs analytics.view;
// without it the band holds the period only (the page itself needs only historian.view).
//
// CHG-175 (owner's design, the Historical CHG-159 pattern): one band card — the loop, the range named by its
// options, the stepper "‹ 6 Nov 10:45 → 22:45 ›", Pause and Now, Loop Explorer ↗ and Historical ↗ at the far end;
// Custom opens From · To · Apply in the band. The chart has one head row (the legend as before, Signals ▾, the
// zoom tools) and a foot strip (the state, the zone once). The page owns the period (./trend/useTrendPeriod) and
// drives the chart with it, every time in the site zone; the address follows the screen.
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import TrendCore, { type PenSpec, type TrendState } from './TrendCore';
import { LoopBand } from '../Cpm/context/LoopBand';
import { QueryError, WorkspaceHeader } from '../Cpm/shared';
import { explorerHref, historicalHref } from '../Cpm/cpaHref';
import { useCpmLoops } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import type { CpmLoop } from '../../api/cpmApi';
import { siteZone, zoneAbbr } from '../../cpa/siteTime';
import { loopPens, penSpecsOf, rolesOf, type PenRole } from './trend/loopPens';
import { useTrendPeriod } from './trend/useTrendPeriod';
import { TrendPeriodBar } from './trend/TrendPeriodBar';
import { SignalsMenu } from './trend/SignalsMenu';
import './Designer.css';

/** A setpoint pen is dashed (CD14). The URL carries no role, so the tag's measurement name decides. */
const isSetpointTag = (path: string) => /\.sp$/i.test(path);

const iso = (ms: number) => new Date(ms).toISOString();

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
  const zone = siteZone();
  const period = useTrendPeriod(params, setParams);

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

  /** `roles=` as the legend's × writes it: none left reads `none` (empty, not all four). */
  const writeRoles = (left: PenRole[]) => {
    const q = new URLSearchParams(params);
    q.set('roles', left.length > 0 ? left.join(',') : 'none');
    setParams(q, { replace: true });
  };

  const removePen = (path: string) => {
    if (tagPaths.length === 0 && loop) {
      // A loop-driven chart stays loop-driven, so role colours and the SP dash hold.
      writeRoles(fromLoop.filter(p => p.tag !== path).map(p => p.role));
      return;
    }
    const q = new URLSearchParams(params);
    const next = tagPaths.filter(t => t !== path);
    if (next.length === 0 && loop) { q.delete('tags'); q.set('roles', 'none'); } else q.set('tags', next.join(','));
    setParams(q, { replace: true });
  };

  // A chosen loop replaces the pens; the period stays.
  const chooseLoop = (id: string) => setParams(p => {
    p.set('loop', id); p.delete('tags'); p.delete('roles');
    return p;
  });

  // Live only while samples arrive: the newest one is recent against the window (10 % of it, at least a minute).
  const [fresh, setFresh] = useState(false);
  const onSampleAge = useCallback((age: number | null, spanMs: number) => {
    setFresh(age != null && age <= Math.max(60_000, spanMs / 10));
  }, []);

  const noTags = !!loop && tagPaths.length === 0 && !hasTags;
  const state: TrendState | null = pens.length === 0 ? null
    : period.mode === 'fixed' ? 'fixed' : period.mode === 'paused' ? 'paused' : fresh ? 'live' : 'stale';

  // The chart says one thing when it has no pens; the band already says when a loop is not in the registry.
  const emptyContent = loadError ? <QueryError title="Loops unavailable" error={loadError.error} retry={loadError.retry} />
    : noTags ? <span>{loop.loopId} has no signal tags mapped.</span>
      : !canPick ? <span>No tags selected</span>
        : !loopId && !loading ? <strong>Select a loop</strong>
          : '';

  // Loop Explorer ↗ and Historical ↗ only for one loop the registry knows.
  const exits = loop ? (
    <div className="cpm-hist-bandend">
      <ObcButton variant="normal" onClick={() => navigate(explorerHref(loop.loopId))}>Loop Explorer ↗</ObcButton>
      <ObcButton variant="flat" onClick={() => {
        const p = period.current();
        navigate(historicalHref(loop.loopId, { from: iso(p.start), to: iso(p.end) }));
      }}>Historical ↗</ObcButton>
    </div>
  ) : undefined;

  const shownRoles = fromLoop.map(p => p.role);
  const signals = loop && tagPaths.length === 0 && hasTags
    ? <SignalsMenu loop={loop} shown={shownRoles} onChange={writeRoles} />
    : undefined;

  const bar = <TrendPeriodBar period={period} zone={zone} />;

  return (
    // CHG-175: the page's band controls are 32 px (cpm-compact), as on the other redesigned pages.
    <div className="cpm-screen cpm-compact trend-page" data-testid="trend-page">
      <WorkspaceHeader eyebrow="Engineering" title="Trend" />
      {canPick ? (
        <LoopBand card loopId={loopId} onLoop={chooseLoop} end={exits}>{bar}</LoopBand>
      ) : (
        <div className="cpm-loop-context cpm-band cpm-band--card trend-page__band--plain">
          <div className="cpm-band__row">{bar}</div>
        </div>
      )}
      <div className="trend-page__chart">
        <TrendCore
          pens={pens}
          onRemovePen={removePen}
          controlledWindow={period.window}
          zoomResetKey={period.zoomResetKey}
          timeZone={zone}
          frame={{ headTools: signals, state, zoneName: zoneAbbr(zone) }}
          onSampleAge={onSampleAge}
          emptyLegendText=""
          emptyContent={emptyContent}
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
