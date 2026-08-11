import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { CanvasItem } from './types';
import { SymbolRenderer } from './SymbolRenderer';
import { getDefaultSizeSync } from './symbolLibraryService';
import { mediaUrl } from '../../api/mediaApi';
import { ObiCommandLocked } from '@oicl/openbridge-webcomponents-react/icons/icon-command-locked';
import { ObiPlaceholder } from '@oicl/openbridge-webcomponents-react/icons/icon-placeholder';
import { ObiLink } from '@oicl/openbridge-webcomponents-react/icons/icon-link';

interface DesignerCanvasProps {
  items: CanvasItem[];
  selectedIds: string[];
  mode: 'design' | 'preview';
  gridSize?: number;
  showGrid?: boolean;
  zoom?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  /** Display background — a theme token by default, so the artboard follows day/night. */
  canvasBg?: string;
  /** Optional background image (id of an uploaded media asset); drawn under the symbols. */
  canvasBgImage?: string;
  /** Snap to grid. It used to be unconditional, so you could not place anything off-grid at all.
      Hold Alt while dragging to bypass it for one gesture (PI Vision's exact affordance). */
  snapEnabled?: boolean;
  onSelect: (ids: string[]) => void;                 // replace selection
  onToggleSelect: (id: string) => void;              // shift/ctrl-click
  onUpdateItems: (updates: Array<{ id: string; changes: Partial<CanvasItem> }>) => void; // live (no history)
  onCommit: () => void;                               // snapshot history (drag/resize end)
  onAddItem: (type: string, position: { x: number; y: number }) => void;
  onDeleteSelected?: () => void;
  onNudge?: (dx: number, dy: number) => void;         // arrow keys (commits)
  onZoomBy?: (factor: number) => void;                // ctrl+wheel
  onItemContextMenu?: (e: React.MouseEvent, item: CanvasItem) => void; // right-click a symbol
  onBindTag?: (id: string, path: string) => void;                     // drop a tag on a symbol
  onAddBoundSymbol?: (path: string, position: { x: number; y: number }) => void; // drop a tag on empty canvas
}

const snap = (v: number, g: number) => Math.round(v / g) * g;

// ── Smart alignment guides ───────────────────────────────────────────────────
// While dragging, compare the selection's left/centre/right and top/middle/bottom against the same six
// lines on every OTHER item. If one lands within tolerance, nudge the selection onto it and draw the
// line. Tolerance is in CANVAS units, so it is divided by zoom at the call site — otherwise guides get
// stickier the further you zoom in.
const GUIDE_TOLERANCE = 6;

export interface Guide { axis: 'x' | 'y'; at: number }

interface MovingItem { id: string; x: number; y: number }

function computeSmartSnap(
  moving: MovingItem[],
  items: CanvasItem[],
  starts: Map<string, { x: number; y: number }>,
  tol: number,
): { dx: number; dy: number; guides: Guide[] } {
  const movingIds = new Set(moving.map(m => m.id));
  const sizeOf = (id: string) => items.find(i => i.id === id)?.size ?? { width: 0, height: 0 };

  // The selection's bounding box at its candidate position.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of moving) {
    const s = sizeOf(m.id);
    minX = Math.min(minX, m.x); minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + s.width); maxY = Math.max(maxY, m.y + s.height);
  }
  if (!Number.isFinite(minX) || !starts.size) return { dx: 0, dy: 0, guides: [] };

  const selX = [minX, (minX + maxX) / 2, maxX];
  const selY = [minY, (minY + maxY) / 2, maxY];

  const targetsX: number[] = [];
  const targetsY: number[] = [];
  for (const i of items) {
    if (movingIds.has(i.id) || i.hidden) continue;
    const { x, y } = i.position;
    const { width, height } = i.size;
    targetsX.push(x, x + width / 2, x + width);
    targetsY.push(y, y + height / 2, y + height);
  }

  const best = (sel: number[], targets: number[]) => {
    let d = 0, at: number | null = null, dist = tol;
    for (const s of sel) {
      for (const t of targets) {
        const delta = Math.abs(t - s);
        if (delta < dist) { dist = delta; d = t - s; at = t; }
      }
    }
    return { d, at };
  };

  const bx = best(selX, targetsX);
  const by = best(selY, targetsY);
  const guides: Guide[] = [];
  if (bx.at !== null) guides.push({ axis: 'x', at: bx.at });
  if (by.at !== null) guides.push({ axis: 'y', at: by.at });
  return { dx: bx.d, dy: by.d, guides };
}

export const DesignerCanvas: React.FC<DesignerCanvasProps> = ({
  items, selectedIds, mode, gridSize = 10, showGrid = true, zoom = 1,
  canvasWidth = 1920, canvasHeight = 1080, canvasBg = 'var(--ams-canvas-bg)', canvasBgImage, snapEnabled = true,
  onSelect, onToggleSelect, onUpdateItems, onCommit, onAddItem, onDeleteSelected, onNudge, onZoomBy,
  onItemContextMenu, onBindTag, onAddBoundSymbol,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [drag, setDrag] = useState<null | { sx: number; sy: number; starts: Map<string, { x: number; y: number }> }>(null);
  const [resize, setResize] = useState<null | { handle: string; sx: number; sy: number; w: number; h: number; x: number; y: number; id: string }>(null);
  const [rotate, setRotate] = useState<null | { id: string; cx: number; cy: number }>(null);
  const [marquee, setMarquee] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const selected = new Set(selectedIds);
  const primaryId = selectedIds[0] ?? null;

  const groupMembers = useCallback((item: CanvasItem): string[] =>
    item.groupId ? items.filter(i => i.groupId === item.groupId).map(i => i.id) : [item.id], [items]);

  // ── keyboard: nudge / delete / esc / space-pan ─────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // The typing guard has to come FIRST. The space branch used to sit above it, so typing a space
      // into the palette search or a property field flipped the canvas into pan mode.
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable;
      if (typing) return;

      if (e.key === ' ') { setSpaceDown(true); return; }
      if (mode !== 'design' || selectedIds.length === 0) return;
      switch (e.key) {
        case 'Delete': case 'Backspace': e.preventDefault(); onDeleteSelected?.(); break;
        case 'ArrowUp':    e.preventDefault(); onNudge?.(0, -(e.shiftKey ? 10 : 1)); break;
        case 'ArrowDown':  e.preventDefault(); onNudge?.(0,  (e.shiftKey ? 10 : 1)); break;
        case 'ArrowLeft':  e.preventDefault(); onNudge?.(-(e.shiftKey ? 10 : 1), 0); break;
        case 'ArrowRight': e.preventDefault(); onNudge?.( (e.shiftKey ? 10 : 1), 0); break;
        case 'Escape': onSelect([]); break;
      }
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [mode, selectedIds, onDeleteSelected, onNudge, onSelect]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };

  // ── drop: a new symbol (palette) OR a data tag (asset tree) ──────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const symbolType = e.dataTransfer.getData('application/symbol-type');
    if (symbolType) {
      const p = toCanvas(e);
      const d = getDefaultSizeSync(symbolType);
      onAddItem(symbolType, { x: snap(p.x - d.width / 2, gridSize), y: snap(p.y - d.height / 2, gridSize) });
      return;
    }
    const tagPath = e.dataTransfer.getData('application/x-ams-tag');
    if (tagPath) {
      const p = toCanvas(e);
      // Topmost symbol under the drop point, if any → add the tag to it (B19); else create a bound
      // value readout at the drop point (B18).
      const hit = [...items]
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
        .find(it => p.x >= it.position.x && p.x <= it.position.x + it.size.width
                 && p.y >= it.position.y && p.y <= it.position.y + it.size.height);
      if (hit) onBindTag?.(hit.id, tagPath);
      else onAddBoundSymbol?.(tagPath, { x: snap(p.x, gridSize), y: snap(p.y, gridSize) });
    }
  // toCanvas is stable for a given transform; adding it would rebuild the callback on every pan/zoom.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, gridSize, onAddItem, items, onBindTag, onAddBoundSymbol]);

  // ── item mousedown (select + start drag) ───────────────────────────────────
  const itemMouseDown = (e: React.MouseEvent, item: CanvasItem) => {
    // Middle-button (pan) and Space-pan must reach the wrapper even when the pointer is over a symbol —
    // otherwise panning only worked on empty canvas, which on a dense display is nowhere.
    if (e.button === 1 || spaceDown) return;
    if (mode !== 'design' || item.locked) return;
    e.stopPropagation();
    const members = groupMembers(item);
    if (e.shiftKey || e.ctrlKey || e.metaKey) { onToggleSelect(item.id); return; }
    // if clicking an unselected item, select it (or its group)
    let sel = selectedIds;
    if (!selected.has(item.id)) { sel = members; onSelect(members); }
    if (e.button === 0) {
      const starts = new Map<string, { x: number; y: number }>();
      const ids = sel.length ? sel : members;
      for (const id of ids) { const it = items.find(x => x.id === id); if (it) starts.set(id, { ...it.position }); }
      setDrag({ sx: e.clientX, sy: e.clientY, starts });
    }
  };

  const resizeMouseDown = (e: React.MouseEvent, item: CanvasItem, handle: string) => {
    if (mode !== 'design' || item.locked) return;
    e.stopPropagation();
    setResize({ handle, sx: e.clientX, sy: e.clientY, w: item.size.width, h: item.size.height, x: item.position.x, y: item.position.y, id: item.id });
  };
  const rotateMouseDown = (e: React.MouseEvent, item: CanvasItem) => {
    if (mode !== 'design' || item.locked) return;
    e.stopPropagation();
    setRotate({ id: item.id, cx: item.position.x + item.size.width / 2, cy: item.position.y + item.size.height / 2 });
  };

  // ── canvas mousedown → marquee (empty area = canvas bg or grid layer) ──────
  const canvasMouseDown = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const onEmpty = el === canvasRef.current || el.classList.contains('designer-canvas__grid');
    if (mode !== 'design' || !onEmpty || spaceDown) return;
    const p = toCanvas(e);
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    if (!(e.shiftKey || e.ctrlKey)) onSelect([]);
  };

  // ── global move/up for drag / resize / rotate / marquee ────────────────────
  useEffect(() => {
    if (!drag && !resize && !rotate && !marquee) return;
    // FE-04: mousemove fires far faster than the display refreshes; running smart-snap +
    // onUpdateItems per raw event burned a full snap computation for frames that were
    // never painted. Coalesce to one processed move per animation frame (last event wins).
    let pendingFrame = 0;
    let latestEvent: MouseEvent | null = null;
    const move = (e: MouseEvent) => {
      latestEvent = e;
      if (pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        if (latestEvent) processMove(latestEvent);
      });
    };
    const processMove = (e: MouseEvent) => {
      // Alt bypasses snapping for this gesture without turning the setting off — the single highest
      // value-to-effort affordance in an industrial editor, and PI Vision has exactly it.
      const g = (v: number) => (snapEnabled && !e.altKey ? snap(v, gridSize) : Math.round(v));
      if (drag) {
        const dx = (e.clientX - drag.sx) / zoom, dy = (e.clientY - drag.sy) / zoom;
        const moving = [...drag.starts].map(([id, s]) => ({ id, x: g(s.x + dx), y: g(s.y + dy) }));

        // Smart alignment guides: snap the dragged selection's edges/centres to the OTHER items'
        // edges/centres, and draw the line we snapped to. Not in PI Vision (which only has grid snap),
        // but standard in Ignition Perspective / InTouch / every modern editor — and the thing that
        // actually makes a display look aligned rather than approximately aligned.
        const adj = snapEnabled && !e.altKey
          ? computeSmartSnap(moving, items, drag.starts, GUIDE_TOLERANCE / zoom)
          : { dx: 0, dy: 0, guides: [] as Guide[] };
        setGuides(adj.guides);

        onUpdateItems(moving.map(m => ({
          id: m.id,
          changes: { position: { x: m.x + adj.dx, y: m.y + adj.dy } },
        })));
      } else if (resize) {
        const dx = (e.clientX - resize.sx) / zoom, dy = (e.clientY - resize.sy) / zoom;
        let w = resize.w, h = resize.h;
        if (resize.handle.includes('e')) w = Math.max(20, resize.w + dx);
        if (resize.handle.includes('w')) w = Math.max(20, resize.w - dx);
        if (resize.handle.includes('s')) h = Math.max(20, resize.h + dy);
        if (resize.handle.includes('n')) h = Math.max(20, resize.h - dy);
        // Shift preserves aspect ratio (Q8 / B23). Edge handles drive the other dimension;
        // corner handles use width as the driver.
        if (e.shiftKey && resize.w > 0 && resize.h > 0) {
          const aspect = resize.w / resize.h;
          const wChanged = /[ew]/.test(resize.handle);
          const hChanged = /[ns]/.test(resize.handle);
          if (hChanged && !wChanged) w = Math.max(20, h * aspect);
          else h = Math.max(20, w / aspect);
        }
        // Anchor the opposite edge for west/north handles, derived from the FINAL size.
        let x = resize.x, y = resize.y;
        if (resize.handle.includes('w')) x = resize.x + (resize.w - w);
        if (resize.handle.includes('n')) y = resize.y + (resize.h - h);
        onUpdateItems([{ id: resize.id, changes: { position: { x: snap(x, gridSize), y: snap(y, gridSize) }, size: { width: snap(w, gridSize), height: snap(h, gridSize) } } }]);
      } else if (rotate) {
        const p = toCanvas(e);
        const deg = Math.round((Math.atan2(p.y - rotate.cy, p.x - rotate.cx) * 180 / Math.PI + 90) / 5) * 5;
        onUpdateItems([{ id: rotate.id, changes: { rotation: deg } }]);
      } else if (marquee) {
        const p = toCanvas(e);
        setMarquee(m => m && { ...m, x1: p.x, y1: p.y });
      }
    };
    const up = () => {
      if (marquee) {
        const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
        const w = Math.abs(marquee.x1 - marquee.x0), h = Math.abs(marquee.y1 - marquee.y0);
        if (w > 3 || h > 3) {
          const hit = items.filter(it => it.position.x < x + w && it.position.x + it.size.width > x && it.position.y < y + h && it.position.y + it.size.height > y).map(it => it.id);
          onSelect(hit);
        }
        setMarquee(null);
      }
      if (drag || resize || rotate) onCommit();
      setDrag(null); setResize(null); setRotate(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  // toCanvas is stable for a given transform; adding it would re-run the effect on every pan/zoom.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, resize, rotate, marquee, zoom, gridSize, snapEnabled, items, onUpdateItems, onCommit, onSelect]);

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey && onZoomBy) { e.preventDefault(); onZoomBy(e.deltaY < 0 ? 1.1 : 0.9); }
  };

  // ── Pan ────────────────────────────────────────────────────────────────────
  // The toolbar has advertised "Space+drag pan" for two phases and it did NOTHING — `spaceDown` only
  // swapped the cursor to `grab`. Panning is implemented by scrolling the canvas well (which keeps the
  // scrollbars honest). Two gestures, because industrial editors expect both:
  //   · Space + drag   (the advertised one)
  //   · Middle-mouse drag (never conflicts with anything, so it always works)
  const panRef = useRef<null | { sx: number; sy: number; sl: number; st: number }>(null);
  const scrollParent = () => wrapperRef.current?.parentElement ?? null;

  const startPan = (e: React.MouseEvent) => {
    const el = scrollParent();
    if (!el) return;
    e.preventDefault();
    panRef.current = { sx: e.clientX, sy: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };

  useEffect(() => {
    if (!panRef.current) return;
    const move = (e: MouseEvent) => {
      const el = scrollParent();
      const p = panRef.current;
      if (!el || !p) return;
      el.scrollLeft = p.sl - (e.clientX - p.sx);
      el.scrollTop = p.st - (e.clientY - p.sy);
    };
    const up = () => { panRef.current = null; setPanning(false); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [panning]);

  const wrapperMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (spaceDown && e.button === 0)) {   // middle button, or Space+left
      setPanning(true);
      startPan(e);
    }
  };

  const sorted = [...items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  return (
    <div
      ref={wrapperRef}
      className={`designer-canvas-wrapper${spaceDown || panning ? ' designer-canvas-wrapper--pan' : ''}${panning ? ' designer-canvas-wrapper--panning' : ''}`}
      onWheel={onWheel}
      onMouseDown={wrapperMouseDown}
      // Middle-click otherwise triggers the browser's autoscroll widget.
      onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
    >
      {/* The floating zoom/grid/items chip that used to sit here is gone: it repeated what the toolbar
          and the status bar already say (zoom was displayed in THREE places at once). */}
      {/* Stage: reserves the SCALED footprint in layout. `transform: scale()` does not affect layout, so
          without this the well never overflowed — which is why zooming in gave you nothing to scroll or
          pan to, and half the artboard was simply unreachable at any zoom above fit. */}
      <div
        className="designer-canvas__stage"
        style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}
      >
      <div
        ref={canvasRef}
        className={`designer-canvas ${mode === 'preview' ? 'designer-canvas--preview' : ''}${drag ? ' designer-canvas--dragging' : ''}`}
        style={{
          width: canvasWidth, height: canvasHeight,
          // backgroundColor (not the `background` shorthand) so an optional image layers on top of it.
          backgroundColor: canvasBg,
          ...(canvasBgImage ? {
            backgroundImage: `url(${mediaUrl(canvasBgImage)})`,
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
          } : {}),
          transform: `scale(${zoom})`, transformOrigin: 'top left',
        }}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onMouseDown={canvasMouseDown}
      >
        {showGrid && mode === 'design' && <div className="designer-canvas__grid" />}

        {/* Smart alignment guides — the line the selection just snapped to. */}
        {guides.map((g, n) => (
          <div
            key={`${g.axis}-${n}`}
            className={`designer-canvas__guide designer-canvas__guide--${g.axis}`}
            data-testid="align-guide"
            style={g.axis === 'x'
              ? { left: g.at, top: 0, bottom: 0, width: 1 }
              : { top: g.at, left: 0, right: 0, height: 1 }}
          />
        ))}

        {sorted.map(item => {
          // `hidden` was INVERTED: the item vanished from the EDITOR (where you need to see it to bring
          // it back) but still rendered in the runtime. Hidden means hidden at runtime; in design mode
          // it stays visible but ghosted, so it remains selectable from the canvas and the layers panel.
          if (item.hidden && mode === 'preview') return null;
          const isSel = selected.has(item.id);
          const isPrimary = item.id === primaryId && selectedIds.length === 1;
          const tf = [
            item.rotation ? `rotate(${item.rotation}deg)` : '',
            item.flipH ? 'scaleX(-1)' : '', item.flipV ? 'scaleY(-1)' : '',
          ].filter(Boolean).join(' ') || undefined;
          return (
            <div
              key={item.id}
              className={`designer-canvas__item ${isSel ? 'designer-canvas__item--selected' : ''} ${item.locked ? 'designer-canvas__item--locked' : ''}${item.hidden ? ' designer-canvas__item--hidden' : ''}`}
              style={{ left: item.position.x, top: item.position.y, width: item.size.width, height: item.size.height, transform: tf, zIndex: item.zIndex || 0 }}
              onMouseDown={(e) => itemMouseDown(e, item)}
              onContextMenu={onItemContextMenu ? (e) => onItemContextMenu(e, item) : undefined}
            >
              <SymbolRenderer item={item} mode={mode} />
              {isPrimary && mode === 'design' && !item.locked && (
                <div className="designer-canvas__handles">
                  <div className="designer-canvas__rotate-handle" onMouseDown={(e) => rotateMouseDown(e, item)} title="Rotate" />
                  {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => (
                    <div key={h} className={`designer-canvas__handle designer-canvas__handle--${h}`} onMouseDown={(e) => resizeMouseDown(e, item, h)} />
                  ))}
                </div>
              )}
              {item.locked && mode === 'design' && <div className="designer-canvas__lock-indicator"><ObiCommandLocked /></div>}
              {/* A symbol that navigates should say so at author time — otherwise a link is invisible
                  until someone runs the display and clicks it. */}
              {item.navigationLink && mode === 'design' && (
                <div className="designer-canvas__link-indicator" title="Has a navigation link"><ObiLink /></div>
              )}
            </div>
          );
        })}

        {marquee && (
          <div className="designer-canvas__selection-box" style={{
            left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
          }} />
        )}

        {items.length === 0 && mode === 'design' && (
          <div className="designer-canvas__empty">
            <div className="designer-canvas__empty-icon"><ObiPlaceholder /></div>
            <div className="designer-canvas__empty-title">Empty Canvas</div>
            <div className="designer-canvas__empty-hint">Drag components from the palette</div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default DesignerCanvas;
