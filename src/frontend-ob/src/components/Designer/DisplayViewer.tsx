'use client';

// Phase B — Standalone runtime viewer.
// Read-only route /display/:id (+ ?asset=), decoupled from the editor: loads published
// content, binds live via MQTT, exposes NO edit affordances (no palette / inspector /
// toolbar). Full-screen/kiosk + auto-refresh of the display definition.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CanvasItem, NavigationLink } from './types';
import { SymbolRenderer } from './SymbolRenderer';
import { useMqttStore } from '../../store/mqttStore';
import { useDisplayTimeStore } from '../../store/timeStore';
import { TimeBar } from './TimeBar';
import { pensFromItems, pensFromItem } from './TrendChart';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import TrendDialog from './TrendDialog';
import { isSafeUrl } from './NavigationEditor';
import './Designer.css';
import { apiFetch } from '../../api/apiFetch';
import { useTheme } from '../../App';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface ViewerContent {
  name: string;
  items: CanvasItem[];
  width: number;
  height: number;
  backgroundColor: string;
}

async function fetchViewerContent(id: string): Promise<ViewerContent> {
  // Phase L — the runtime serves the PUBLISHED version, never the draft. Without `stage=published`
  // this endpoint falls back to the latest draft, which is what used to make every designer save go
  // live instantly. A display that has never been published 404s here (nothing to run yet).
  const res = await apiFetch(`${API_BASE}/${id}/content?stage=published`);
  if (res.status === 404) throw new Error('This display has no published version yet.');
  if (!res.ok) throw new Error(`Failed to load display (${res.status})`);
  const json = await res.json();
  const snapshot = json.snapshot ?? json.content ?? {};
  const settings = snapshot.settings ?? {};
  return {
    name: json.name ?? 'Display',
    items: snapshot.items ?? [],
    width: settings.canvasWidth ?? json.width ?? 1920,
    height: settings.canvasHeight ?? json.height ?? 1080,
    // Default to the theme token, not a hardcoded navy: an inline hex here can't follow day/night and
    // can't be overridden by any stylesheet. `var(--ams-canvas-bg)` is a valid inline background value.
    backgroundColor: settings.backgroundColor ?? json.backgroundColor ?? 'var(--ams-canvas-bg)',
  };
}

const REFRESH_OPTIONS = [
  { label: 'Off', ms: 0 },
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
];

// Breadcrumb trail (HPHMI Level 1→4 navigation path), persisted for the session.
interface Crumb { id: string; asset?: string; name: string; }
const TRAIL_KEY = 'ams-display-trail';
function readTrail(): Crumb[] {
  try { return JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '[]'); } catch { return []; }
}
function writeTrail(t: Crumb[]) {
  try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}
const assetShort = (a?: string) => (a ? a.split('/').pop() : undefined);

// Asset-relative binding: substitute {{element}} with the selected asset path at runtime.
function substituteElement(item: CanvasItem, element: string): CanvasItem {
  const sub = (s: string) => s.replace(/\{\{element\}\}/g, element);
  const bindings = item.bindings
    ? Object.fromEntries(Object.entries(item.bindings).map(([k, v]) => [k, sub(v)]))
    : item.bindings;
  const navigationLink = item.navigationLink
    ? { ...item.navigationLink, assetContext: item.navigationLink.assetContext ? sub(item.navigationLink.assetContext) : item.navigationLink.assetContext }
    : item.navigationLink;
  return { ...item, bindings, navigationLink };
}
const isAssetRelative = (item: CanvasItem) =>
  !!item.bindings && Object.values(item.bindings).some(v => v.includes('{{element}}'));

export const DisplayViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const assetContext = params.get('asset') ?? undefined; // Phase E will rebind against this
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [refreshMs, setRefreshMs] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [trail, setTrail] = useState<Crumb[]>(() => readTrail());
  const [popup, setPopup] = useState<{ id: string; asset?: string } | null>(null);
  // Ad-hoc trend from the RUNTIME. An operator can:
  //   · Trend            → the whole display's bound tags
  //   · Ctrl/Shift-click → build a multi-symbol selection, then Trend
  //   · "Pick" mode      → click one symbol to trend that single tag
  const [trendOpen, setTrendOpen] = useState(false);
  const [trendSel, setTrendSel] = useState<string[]>([]);
  const [trendPickMode, setTrendPickMode] = useState(false);
  const toggleTrendPick = (id: string) =>
    setTrendSel(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));
  // Asset-relative swap: the currently selected element (device path) bound to {{element}}.
  const [element, setElement] = useState<string | undefined>(assetContext);
  useEffect(() => { if (assetContext) setElement(assetContext); }, [assetContext]);
  // Kiosk day/night. This used to mutate document.documentElement directly while the app's own theme
  // state stayed on 'day' — so after switching to night in the viewer, the shell's toggle still
  // highlighted "day" and clicking "day" did nothing (state unchanged → no effect → no DOM write).
  // The viewer renders inside ThemeContext, so it drives the SAME state as the rest of the app.
  const { theme, setTheme } = useTheme();
  const applyTheme = (t: string) => setTheme(t as 'day' | 'bright' | 'night');

  /** The asset a link passes to its target, per the authored mode (PI Vision's IncludeAsset). */
  const resolveLinkAsset = (link: NavigationLink, item?: CanvasItem): string | undefined => {
    const mode = link.assetContextMode ?? (link.assetContext ? 'explicit' : 'none');
    if (mode === 'none') return undefined;
    if (mode === 'explicit') return link.assetContext;
    // 'current-asset' / 'current-asset-as-root': take the device path off the symbol's own binding —
    // "houston/crude1/pump101.speed" → "houston/crude1/pump101". This is what makes a pump tile on an
    // overview open the pump detail *for that pump*.
    const bound = Object.values(item?.bindings ?? {}).find(v => typeof v === 'string' && v.includes('/'));
    if (!bound) return undefined;
    const dot = bound.lastIndexOf('.');
    return dot > 0 ? bound.slice(0, dot) : bound;
  };

  // Open a navigation link from a clicked symbol.
  const handleNav = (link: NavigationLink, item?: CanvasItem) => {
    const openMode = link.openMode ?? 'replace';
    const asset = resolveLinkAsset(link, item);
    const params = new URLSearchParams();
    if (asset) params.set('asset', asset);
    if (link.assetContextMode === 'current-asset-as-root' && asset) params.set('assetRoot', asset);
    // Carry the current time range to the target when the link asks for it (M4). Pass the
    // EXPRESSIONS so a live window stays live on the target.
    if (link.includeTimeRange) {
      const t = useDisplayTimeStore.getState();
      params.set('start', t.startExpr);
      params.set('end', t.endExpr);
    }
    const q = params.toString() ? `?${params}` : '';

    if (link.targetUrl) {
      // Only follow a link the author was allowed to save (https / same-origin). Belt and braces: the
      // editor validates, but a snapshot could have been hand-edited or imported.
      if (!isSafeUrl(link.targetUrl)) return;
      if (openMode === 'new-tab') window.open(link.targetUrl, '_blank', 'noopener');
      else window.location.href = link.targetUrl;
      return;
    }
    if (!link.targetDisplayId) return;
    if (openMode === 'new-tab') { window.open(`/display/${link.targetDisplayId}${q}`, '_blank', 'noopener'); return; }
    if (openMode === 'popup') { setPopup({ id: link.targetDisplayId, asset }); return; }
    navigate(`/display/${link.targetDisplayId}${q}`);
  };

  const goCrumb = (c: Crumb) => navigate(`/display/${c.id}${c.asset ? `?asset=${encodeURIComponent(c.asset)}` : ''}`);

  // Live data: ensure the MQTT client is connected for the whole viewer lifetime.
  const connect = useMqttStore(s => s.connect);
  useEffect(() => { connect(); }, [connect]);

  // Seed the display time context from URL params (?start=&end=). The saved defaults become the
  // "Revert" target. (K19 / M9.)
  useEffect(() => {
    useDisplayTimeStore.getState().markSaved();
    useDisplayTimeStore.getState().initFromUrl(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['viewer-display', id],
    queryFn: () => fetchViewerContent(id!),
    enabled: !!id,
    refetchInterval: refreshMs || false,
    // "Not published" is a terminal answer, not a transient failure — retrying it just leaves the
    // operator staring at "Loading…" instead of telling them why the display is blank.
    retry: (count, err) => !/no published version/i.test((err as Error).message) && count < 2,
  });

  // Maintain the breadcrumb trail: append on forward-nav, trim when returning to a prior crumb.
  useEffect(() => {
    if (!id) return;
    setTrail(prev => {
      const idx = prev.findIndex(c => c.id === id && c.asset === assetContext);
      const name = data?.name ?? id;
      const next = idx >= 0 ? prev.slice(0, idx + 1) : [...prev, { id, asset: assetContext, name }];
      next[next.length - 1] = { id, asset: assetContext, name };
      writeTrail(next);
      return next;
    });
  }, [id, assetContext, data?.name]);

  // Asset-relative: detect {{element}} bindings, list swap candidates (devices in the same
  // unit), and produce runtime-resolved items. Changing `element` rebinds the whole display.
  const items = data?.items ?? [];
  const hasAssetRelative = useMemo(() => items.some(isAssetRelative), [items]);
  const swapPrefix = useMemo(() => {
    const base = element || '';
    const i = base.lastIndexOf('/');
    return i > 0 ? base.slice(0, i) : '';
  }, [element]);
  const { data: candidates } = useQuery({
    queryKey: ['swap-candidates', swapPrefix, element],
    queryFn: async () => {
      // Discover peers by TYPE/TEMPLATE (H2/H6/H11), not just "same folder". Learn the current
      // asset's template + level, then search the subtree for others like it. Falls back gracefully
      // to same-level discovery when templates aren't configured yet.
      let template: string | undefined;
      let assetType: number | undefined = 4; // default: Device
      if (element) {
        const encoded = element.split('/').map(encodeURIComponent).join('/');
        const cur = await apiFetch(`/api/assets/by-path/${encoded}`);
        if (cur.ok) {
          const a = await cur.json() as { template?: string; type?: number };
          template = a.template || undefined;
          if (typeof a.type === 'number') assetType = a.type;
        }
      }
      const res = await apiFetch('/api/assets/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: swapPrefix || undefined,
          returnAllDescendants: true,
          template,
          assetType: template ? undefined : assetType,
          take: 200,
        }),
      });
      if (!res.ok) return [] as { contextualPath: string; name: string }[];
      const j = await res.json();
      return (j.assets ?? []) as { contextualPath: string; name: string }[];
    },
    enabled: hasAssetRelative,
  });
  // An asset-relative display opened WITHOUT ?asset= had no element, so nothing was substituted: every
  // symbol resolved the literal path "{{element}}.speed", 404'd, and rendered "--" with no explanation
  // (and the launcher links carry no asset param, so this was the normal way to open one). Default to
  // the first candidate so the display is alive on arrival; the Asset selector still lets them switch.
  useEffect(() => {
    if (!hasAssetRelative || element || !candidates?.length) return;
    setElement(candidates[0].contextualPath);
  }, [hasAssetRelative, element, candidates]);

  const resolvedItems = useMemo(
    () => (element ? items.map(i => (isAssetRelative(i) ? substituteElement(i, element) : i)) : items),
    [items, element],
  );

  // Pens for the trend dialog: the SELECTED symbols if any, else the whole display.
  // An explicit selection is never truncated — only the whole-display fallback is capped at the size
  // of the pen palette (and the operator is told, rather than silently losing tags).
  const allPens = useMemo(() => pensFromItems(resolvedItems), [resolvedItems]);
  const selectedPens = useMemo(
    () => pensFromItems(resolvedItems.filter(i => trendSel.includes(i.id))),
    [resolvedItems, trendSel],
  );
  const viewerPens = selectedPens.length ? selectedPens : allPens.slice(0, 6);
  const penCapNote = !selectedPens.length && allPens.length > 6
    ? `Showing the first 6 of ${allPens.length} tags — ctrl/shift-click symbols to choose.`
    : undefined;

  const toggleFullscreen = async () => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (!id) return <div className="display-viewer__msg">No display id.</div>;
  if (isLoading) return <div className="display-viewer__msg">Loading display…</div>;
  // Only replace the screen when there is NOTHING to show. It used to be `error || !data`: react-query
  // keeps the last good data on a failed refetch, so with auto-refresh on (kiosk mode) a single
  // transient blip blanked a live control-room screen even though valid content was cached. A failed
  // refresh is now a non-destructive banner over the still-running display (below).
  if (!data) {
    const msg = (error as Error | null)?.message;
    return (
      <div className="display-viewer__msg" data-testid="viewer-error">
        {msg && /no published version/i.test(msg)
          ? 'This display has no published version yet. An engineer must publish it before it can run.'
          : 'Failed to load display.'}
      </div>
    );
  }

  return (
    <div className="display-viewer" ref={rootRef} data-asset={assetContext}>
      {/* A refresh failed but we still have good content — say so without blanking the screen. */}
      {error && (
        <div className="display-viewer__stale" data-testid="viewer-stale">
          Refresh failed — showing the last loaded version.
        </div>
      )}
      {/* Minimal runtime bar — status + kiosk/refresh only, NO editing controls */}
      <div className="display-viewer__bar">
        <button className="display-viewer__btn" onClick={() => navigate('/displays')} title="Home">⌂</button>
        <button className="display-viewer__btn" onClick={() => navigate(-1)} title="Back">←</button>
        <button className="display-viewer__btn" onClick={() => navigate(1)} title="Forward">→</button>
        <nav className="display-viewer__crumbs">
          {trail.map((c, i) => (
            <span key={`${c.id}-${c.asset ?? ''}-${i}`} className="display-viewer__crumb">
              {i > 0 && <span className="display-viewer__crumb-sep">›</span>}
              <button
                className={`display-viewer__crumb-btn ${i === trail.length - 1 ? 'active' : ''}`}
                onClick={() => goCrumb(c)}
              >
                {c.name}{c.asset ? ` · ${assetShort(c.asset)}` : ''}
              </button>
            </span>
          ))}
        </nav>
        <span className="display-viewer__spacer" />
        {/* Trend from the published runtime — whole display, a multi-symbol selection, or one tag. */}
        <button
          className={`display-viewer__btn${trendPickMode ? ' active' : ''}`}
          data-testid="viewer-trend-pick"
          onClick={() => setTrendPickMode(v => !v)}
          disabled={allPens.length === 0}
          title="Pick mode: click a symbol to trend that tag"
        >Pick tag</button>
        {trendSel.length > 0 && (
          <button
            className="display-viewer__btn"
            data-testid="viewer-trend-clear"
            onClick={() => setTrendSel([])}
            title="Clear the trend selection"
          >Clear ({trendSel.length})</button>
        )}
        <button
          className="display-viewer__btn"
          data-testid="viewer-trend"
          disabled={viewerPens.length === 0}
          onClick={() => setTrendOpen(true)}
          title={
            selectedPens.length
              ? `Trend the ${selectedPens.length} selected tag(s)`
              : `Trend this display's ${Math.min(allPens.length, 6)} tag(s)`
          }
        >
          <ObiTrend /> Trend{trendSel.length ? ` (${selectedPens.length})` : ''}
        </button>
        <div className="display-viewer__themes">
          {(['day', 'night'] as const).map(t => (
            <button key={t} className={`display-viewer__btn${theme === t ? ' active' : ''}`} onClick={() => applyTheme(t)}>{t}</button>
          ))}
        </div>
        {hasAssetRelative && (
          <label className="display-viewer__refresh">
            Asset
            <select
              className="display-viewer__asset-select"
              value={element ?? ''}
              onChange={e => setElement(e.target.value)}
            >
              {(candidates ?? []).map(c => (
                <option key={c.contextualPath} value={c.contextualPath}>
                  {c.contextualPath.split('/').pop()}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="display-viewer__refresh">
          Auto-refresh
          <select value={refreshMs} onChange={e => setRefreshMs(Number(e.target.value))}>
            {REFRESH_OPTIONS.map(o => <option key={o.ms} value={o.ms}>{o.label}</option>)}
          </select>
        </label>
        <button className="display-viewer__btn" onClick={() => refetch()}>Refresh</button>
        <button className="display-viewer__btn" onClick={toggleFullscreen}>
          {isFullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      {/* Read-only stage — each item positioned absolutely, rendered live in preview mode */}
      <div className="display-viewer__stage-wrap">
        <div
          className="display-viewer__stage"
          style={{ width: data.width, height: data.height, background: data.backgroundColor }}
        >
          {resolvedItems.map(item => {
            const trendable = pensFromItem(item).length > 0;
            const picked = trendSel.includes(item.id);
            return (
            <div
              key={item.id}
              className={
                `display-viewer__item${item.navigationLink ? ' display-viewer__item--link' : ''}` +
                `${trendable ? ' display-viewer__item--trendable' : ''}` +
                `${picked ? ' display-viewer__item--picked' : ''}`
              }
              data-resolved={item.bindings ? Object.values(item.bindings)[0] : undefined}
              data-trend-selected={picked || undefined}
              // Click policy in the runtime (PI Vision-style):
              //   ctrl/shift-click a bound symbol → add/remove it from the trend selection (never navigates)
              //   plain click in "pick" mode      → trend THAT ONE tag immediately
              //   plain click otherwise           → unchanged: follow the navigation link, if any
              // Previously onClick was attached ONLY to items with a navigationLink, so no symbol was
              // selectable and the operator could only trend the whole display.
              onClick={(e) => {
                if (trendable && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                  e.preventDefault(); e.stopPropagation();
                  toggleTrendPick(item.id);
                  return;
                }
                if (trendable && trendPickMode) {
                  e.preventDefault(); e.stopPropagation();
                  setTrendSel([item.id]);
                  setTrendOpen(true);
                  return;
                }
                if (item.navigationLink) handleNav(item.navigationLink, item);
              }}
              role={item.navigationLink || trendable ? 'button' : undefined}
              title={
                item.navigationLink ? (item.navigationLink.label ?? 'Open display')
                  : trendable ? (trendPickMode ? 'Click to trend this tag' : 'Ctrl/Shift-click to add to the trend selection')
                  : undefined
              }
              style={{
                position: 'absolute',
                left: item.position?.x ?? 0,
                top: item.position?.y ?? 0,
                width: item.size?.width ?? 100,
                height: item.size?.height ?? 60,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                cursor: item.navigationLink || (trendable && trendPickMode) ? 'pointer' : undefined,
              }}
            >
              <SymbolRenderer item={item} mode="preview" />
            </div>
            );
          })}
        </div>
      </div>

      {/* Display time bar (K1–K7) — one time context every time-aware symbol follows. */}
      <TimeBar />

      {/* Faceplate popup (openMode: 'popup') — isolated via iframe on the same viewer route */}
      {popup && (
        <div className="display-viewer__popup-overlay" onClick={() => setPopup(null)}>
          <div className="display-viewer__popup" onClick={e => e.stopPropagation()}>
            <div className="display-viewer__popup-bar">
              <span>Faceplate{popup.asset ? ` · ${assetShort(popup.asset)}` : ''}</span>
              <button className="display-viewer__btn" onClick={() => setPopup(null)}>✕</button>
            </div>
            <iframe
              title="faceplate"
              className="display-viewer__popup-frame"
              src={`/display/${popup.id}${popup.asset ? `?asset=${encodeURIComponent(popup.asset)}` : ''}`}
            />
          </div>
        </div>
      )}

      {/* Phase J — ad-hoc trend from the published runtime (Operators/Viewers may trend) */}
      {trendOpen && <TrendDialog pens={viewerPens} note={penCapNote} onClose={() => setTrendOpen(false)} />}
    </div>
  );
};

export default DisplayViewer;
