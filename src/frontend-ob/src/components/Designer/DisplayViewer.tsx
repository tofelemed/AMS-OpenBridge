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
import { pensFromItems } from './TrendChart';
import TrendDialog from './TrendDialog';
import './Designer.css';
import { apiFetch } from '../../api/apiFetch';

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
    backgroundColor: settings.backgroundColor ?? json.backgroundColor ?? '#0f172a',
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
  const [trendOpen, setTrendOpen] = useState(false); // Phase J — ad-hoc trend
  // Asset-relative swap: the currently selected element (device path) bound to {{element}}.
  const [element, setElement] = useState<string | undefined>(assetContext);
  useEffect(() => { if (assetContext) setElement(assetContext); }, [assetContext]);
  // Phase H — kiosk day/night: drives data-obc-theme, which re-colors OpenBridge + AMS tokens.
  const [theme, setThemeState] = useState<string>(() =>
    (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-obc-theme') || 'day' : 'day'));
  const applyTheme = (t: string) => { document.documentElement.setAttribute('data-obc-theme', t); setThemeState(t); };

  // Open a navigation link from a clicked symbol.
  const handleNav = (link: NavigationLink) => {
    const openMode = link.openMode ?? 'replace';
    const q = link.assetContext ? `?asset=${encodeURIComponent(link.assetContext)}` : '';
    if (link.targetUrl) {
      if (openMode === 'new-tab') window.open(link.targetUrl, '_blank', 'noopener');
      else window.location.href = link.targetUrl;
      return;
    }
    if (!link.targetDisplayId) return;
    if (openMode === 'new-tab') { window.open(`/display/${link.targetDisplayId}${q}`, '_blank', 'noopener'); return; }
    if (openMode === 'popup') { setPopup({ id: link.targetDisplayId, asset: link.assetContext }); return; }
    navigate(`/display/${link.targetDisplayId}${q}`);
  };

  const goCrumb = (c: Crumb) => navigate(`/display/${c.id}${c.asset ? `?asset=${encodeURIComponent(c.asset)}` : ''}`);

  // Live data: ensure the MQTT client is connected for the whole viewer lifetime.
  const connect = useMqttStore(s => s.connect);
  useEffect(() => { connect(); }, [connect]);

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
    queryKey: ['swap-candidates', swapPrefix],
    queryFn: async () => {
      const res = await apiFetch('/api/assets?type=4');
      if (!res.ok) return [] as { contextualPath: string; name: string }[];
      const j = await res.json();
      const all = (j.assets ?? []) as { contextualPath: string; name: string }[];
      return swapPrefix ? all.filter(a => a.contextualPath.startsWith(swapPrefix + '/')) : all;
    },
    enabled: hasAssetRelative,
  });
  const resolvedItems = useMemo(
    () => (element ? items.map(i => (isAssetRelative(i) ? substituteElement(i, element) : i)) : items),
    [items, element],
  );

  // Phase J — pens = the display's bound tags (asset-relative paths already substituted). Capped at
  // 6, the pen-token palette size.
  const viewerPens = useMemo(() => pensFromItems(resolvedItems).slice(0, 6), [resolvedItems]);

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
  // Surface the real reason: an unpublished display isn't a failure, it just has nothing to run yet.
  if (error || !data) {
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
      {/* Minimal runtime bar — status + kiosk/refresh only, NO editing controls */}
      <div className="display-viewer__bar">
        <button className="display-viewer__btn" onClick={() => navigate('/designer')} title="Home">⌂</button>
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
        {/* Phase J — ad-hoc trend of this display's bound tags (Operators/Viewers may trend). */}
        <button
          className="display-viewer__btn"
          data-testid="viewer-trend"
          disabled={viewerPens.length === 0}
          onClick={() => setTrendOpen(true)}
          title={viewerPens.length ? `Trend ${viewerPens.length} tag(s) on this display` : 'No bound tags'}
        >📈 Trend</button>
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
          {resolvedItems.map(item => (
            <div
              key={item.id}
              className={`display-viewer__item${item.navigationLink ? ' display-viewer__item--link' : ''}`}
              data-resolved={item.bindings ? Object.values(item.bindings)[0] : undefined}
              onClick={item.navigationLink ? () => handleNav(item.navigationLink!) : undefined}
              role={item.navigationLink ? 'button' : undefined}
              title={item.navigationLink ? (item.navigationLink.label ?? 'Open display') : undefined}
              style={{
                position: 'absolute',
                left: item.position?.x ?? 0,
                top: item.position?.y ?? 0,
                width: item.size?.width ?? 100,
                height: item.size?.height ?? 60,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                cursor: item.navigationLink ? 'pointer' : undefined,
              }}
            >
              <SymbolRenderer item={item} mode="preview" />
            </div>
          ))}
        </div>
      </div>

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
      {trendOpen && <TrendDialog pens={viewerPens} onClose={() => setTrendOpen(false)} />}
    </div>
  );
};

export default DisplayViewer;
