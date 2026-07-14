import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { CanvasItem } from './types';
import { SymbolRenderer } from './SymbolRenderer';
import { getDefaultSizeSync } from './symbolLibraryService';

interface DesignerCanvasProps {
  items: CanvasItem[];
  selectedIds: string[];
  mode: 'design' | 'preview';
  gridSize?: number;
  showGrid?: boolean;
  zoom?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  onSelect: (ids: string[]) => void;                 // replace selection
  onToggleSelect: (id: string) => void;              // shift/ctrl-click
  onUpdateItems: (updates: Array<{ id: string; changes: Partial<CanvasItem> }>) => void; // live (no history)
  onCommit: () => void;                               // snapshot history (drag/resize end)
  onAddItem: (type: string, position: { x: number; y: number }) => void;
  onDeleteSelected?: () => void;
  onNudge?: (dx: number, dy: number) => void;         // arrow keys (commits)
  onZoomBy?: (factor: number) => void;                // ctrl+wheel
}

const snap = (v: number, g: number) => Math.round(v / g) * g;

export const DesignerCanvas: React.FC<DesignerCanvasProps> = ({
  items, selectedIds, mode, gridSize = 10, showGrid = true, zoom = 1,
  canvasWidth = 1920, canvasHeight = 1080,
  onSelect, onToggleSelect, onUpdateItems, onCommit, onAddItem, onDeleteSelected, onNudge, onZoomBy,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
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
      if (e.key === ' ') { setSpaceDown(true); return; }
      if (mode !== 'design' || selectedIds.length === 0) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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

  // ── drop new symbol ────────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const t = e.dataTransfer.getData('application/symbol-type');
    if (!t || !canvasRef.current) return;
    const p = toCanvas(e);
    const d = getDefaultSizeSync(t);
    onAddItem(t, { x: snap(p.x - d.width / 2, gridSize), y: snap(p.y - d.height / 2, gridSize) });
  }, [zoom, gridSize, onAddItem]);

  // ── item mousedown (select + start drag) ───────────────────────────────────
  const itemMouseDown = (e: React.MouseEvent, item: CanvasItem) => {
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
    const move = (e: MouseEvent) => {
      if (drag) {
        const dx = (e.clientX - drag.sx) / zoom, dy = (e.clientY - drag.sy) / zoom;
        onUpdateItems([...drag.starts].map(([id, s]) => ({ id, changes: { position: { x: snap(s.x + dx, gridSize), y: snap(s.y + dy, gridSize) } } })));
      } else if (resize) {
        const dx = (e.clientX - resize.sx) / zoom, dy = (e.clientY - resize.sy) / zoom;
        let w = resize.w, h = resize.h, x = resize.x, y = resize.y;
        if (resize.handle.includes('e')) w = Math.max(20, resize.w + dx);
        if (resize.handle.includes('w')) { w = Math.max(20, resize.w - dx); x = resize.x + dx; }
        if (resize.handle.includes('s')) h = Math.max(20, resize.h + dy);
        if (resize.handle.includes('n')) { h = Math.max(20, resize.h - dy); y = resize.y + dy; }
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
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [drag, resize, rotate, marquee, zoom, gridSize, items, onUpdateItems, onCommit, onSelect]);

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey && onZoomBy) { e.preventDefault(); onZoomBy(e.deltaY < 0 ? 1.1 : 0.9); }
  };

  const sorted = [...items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  return (
    <div className={`designer-canvas-wrapper${spaceDown ? ' designer-canvas-wrapper--pan' : ''}`} onWheel={onWheel}>
      {mode === 'design' && (
        <div className="designer-canvas-toolbar">
          <span className="designer-canvas-toolbar__value">Zoom {Math.round(zoom * 100)}%</span>
          <span className="designer-canvas-toolbar__value">Grid {gridSize}px</span>
          <span className="designer-canvas-toolbar__value">Items {items.length}</span>
          {selectedIds.length > 0 && <span className="designer-canvas-toolbar__selected">✓ {selectedIds.length} selected</span>}
        </div>
      )}
      <div
        ref={canvasRef}
        className={`designer-canvas ${mode === 'preview' ? 'designer-canvas--preview' : ''}${drag ? ' designer-canvas--dragging' : ''}`}
        style={{
          width: canvasWidth, height: canvasHeight,
          backgroundSize: showGrid && mode === 'design' ? `${gridSize * zoom}px ${gridSize * zoom}px` : undefined,
          transform: `scale(${zoom})`, transformOrigin: 'top left',
        }}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onMouseDown={canvasMouseDown}
      >
        {showGrid && mode === 'design' && <div className="designer-canvas__grid" />}

        {sorted.map(item => {
          if (item.hidden && mode === 'design') return null;
          const isSel = selected.has(item.id);
          const isPrimary = item.id === primaryId && selectedIds.length === 1;
          const tf = [
            item.rotation ? `rotate(${item.rotation}deg)` : '',
            item.flipH ? 'scaleX(-1)' : '', item.flipV ? 'scaleY(-1)' : '',
          ].filter(Boolean).join(' ') || undefined;
          return (
            <div
              key={item.id}
              className={`designer-canvas__item ${isSel ? 'designer-canvas__item--selected' : ''} ${item.locked ? 'designer-canvas__item--locked' : ''}`}
              style={{ left: item.position.x, top: item.position.y, width: item.size.width, height: item.size.height, transform: tf, zIndex: item.zIndex || 0 }}
              onMouseDown={(e) => itemMouseDown(e, item)}
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
              {item.locked && mode === 'design' && <div className="designer-canvas__lock-indicator">🔒</div>}
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
            <div className="designer-canvas__empty-icon">🎨</div>
            <div className="designer-canvas__empty-title">Empty Canvas</div>
            <div className="designer-canvas__empty-hint">Drag components from the palette</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DesignerCanvas;
