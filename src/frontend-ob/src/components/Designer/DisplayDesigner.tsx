import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SymbolPalette } from './SymbolPalette';
import { PropertyInspector } from './PropertyInspector';
import { DesignerCanvas } from './DesignerCanvas';
import { AssetBrowser } from './AssetBrowser';
import type { CanvasItem } from './types';
import { isAutomationType, getDefaultAutomationProps } from './automationTypes';
import { isObcCatalogType, getDefaultObcProps } from './obcCatalogTypes';
import { getDefaultSizeSync } from './symbolLibraryService';
import { preloadForSymbolTypes } from './lazyCategoryRegistry';
import { pensFromItems } from './TrendChart';
import TrendDialog from './TrendDialog';
import { apiFetch } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface DisplayDesignerProps {
  displayId: string;
  onClose?: () => void;
  onSave?: () => void;
}

interface DisplayData {
  id: string;
  name: string;
  path: string;
  displayType: string;
  aspectRatio: string;
  content: {
    items: CanvasItem[];
    settings?: DisplaySettings;
  };
}

interface DisplaySettings {
  gridSize: number;
  showGrid: boolean;
  backgroundColor: string;
  canvasWidth: number;
  canvasHeight: number;
}

// Generate unique ID
function generateId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get default size for a symbol type
function getDefaultSize(type: string): { width: number; height: number } {
  return getDefaultSizeSync(type);
}

// Fetch display content
// display-service returns { ..., snapshot: { items, settings } }; adapt to { content }.
async function fetchDisplay(id: string): Promise<DisplayData> {
  const res = await apiFetch(`${API_BASE}/${id}/content`);
  if (!res.ok) throw new Error('Failed to load display');
  const json = await res.json();
  const snapshot = json.snapshot ?? json.content ?? {};
  return { ...json, content: { items: snapshot.items ?? [], settings: snapshot.settings } } as DisplayData;
}

// Phase L — draft/published metadata + the publish lifecycle (all display.publish-gated server-side).
interface DisplayMeta { draftVersion: number; publishedVersion: number | null }

async function fetchDisplayMeta(id: string): Promise<DisplayMeta> {
  const res = await apiFetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('Failed to load display metadata');
  const j = await res.json();
  return { draftVersion: j.draftVersion, publishedVersion: j.publishedVersion ?? null };
}

async function postLifecycle(id: string, action: 'publish' | 'unpublish' | 'revert'): Promise<void> {
  const res = await apiFetch(`${API_BASE}/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeNote: `designer ${action}` }),
  });
  if (!res.ok) throw new Error(`Failed to ${action} display (${res.status})`);
}
const publishDisplay   = (id: string) => postLifecycle(id, 'publish');
const unpublishDisplay = (id: string) => postLifecycle(id, 'unpublish');
const revertDisplay    = (id: string) => postLifecycle(id, 'revert');

// Save display content — backend contract is { snapshot, changeNote, userId }.
async function saveDisplay(id: string, content: DisplayData['content']): Promise<void> {
  const res = await apiFetch(`${API_BASE}/${id}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot: content, changeNote: 'designer save', userId: 'designer-user' })
  });
  if (!res.ok) throw new Error('Failed to save display');
}

export const DisplayDesigner: React.FC<DisplayDesignerProps> = ({
  displayId,
  onClose,
  onSave
}) => {
  const queryClient = useQueryClient();
  
  // State
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds[0] ?? null;
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize] = useState(10);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  const [trendOpen, setTrendOpen] = useState(false); // Phase J — ad-hoc trend dialog

  // History — ref-based (avoids the stale-closure index desync of the old version)
  const historyRef = useRef<CanvasItem[][]>([]);
  const indexRef = useRef(-1);
  const [hist, setHist] = useState({ index: -1, len: 0 });
  const itemsRef = useRef<CanvasItem[]>([]);
  itemsRef.current = items;
  const clipboardRef = useRef<CanvasItem[]>([]);
  
  // Fetch display data
  const { data: displayData, isLoading, error } = useQuery({
    queryKey: ['display', displayId],
    queryFn: () => fetchDisplay(displayId)
  });
  
  // Load items from fetched data
  useEffect(() => {
    if (displayData?.content?.items) {
      const loaded = displayData.content.items;
      setItems(loaded);
      historyRef.current = [loaded];
      indexRef.current = 0;
      setHist({ index: 0, len: 1 });
      const s = displayData.content.settings;
      if (s?.canvasWidth && s?.canvasHeight) setCanvasSize({ width: s.canvasWidth, height: s.canvasHeight });
    }
  }, [displayData]);

  useEffect(() => { if (items.length > 0) preloadForSymbolTypes(items.map(i => i.type)); }, [items]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () => saveDisplay(displayId, { items, settings: { gridSize, showGrid, backgroundColor: '#0f172a', canvasWidth: canvasSize.width, canvasHeight: canvasSize.height } }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['display', displayId] });
      queryClient.invalidateQueries({ queryKey: ['display-meta', displayId] });
      onSave?.();
    },
  });

  // ── Phase L: draft ⇄ published ────────────────────────────────────────────
  // The Designer always edits the DRAFT. Publish promotes it to the version the runtime viewer
  // serves; until then Operators keep seeing the previous published version.
  const canPublish = useAuthStore(s => s.hasPermission('display.publish'));

  const { data: meta } = useQuery({
    queryKey: ['display-meta', displayId],
    queryFn: () => fetchDisplayMeta(displayId),
  });
  const hasUnpublishedChanges =
    !!meta && meta.publishedVersion != null && meta.draftVersion > meta.publishedVersion;

  const invalidateMeta = () => {
    queryClient.invalidateQueries({ queryKey: ['display-meta', displayId] });
    queryClient.invalidateQueries({ queryKey: ['display', displayId] });
  };
  const publishMutation   = useMutation({ mutationFn: () => publishDisplay(displayId),   onSuccess: invalidateMeta });
  const unpublishMutation = useMutation({ mutationFn: () => unpublishDisplay(displayId), onSuccess: invalidateMeta });
  const revertMutation    = useMutation({
    mutationFn: () => revertDisplay(displayId),
    onSuccess: () => { invalidateMeta(); setIsDirty(false); },
  });

  // ── history (ref-based) ──────────────────────────────────────────────────
  const commit = useCallback((snapshot: CanvasItem[]) => {
    const truncated = historyRef.current.slice(0, indexRef.current + 1);
    const next = [...truncated, snapshot].slice(-50);
    historyRef.current = next;
    indexRef.current = next.length - 1;
    setHist({ index: indexRef.current, len: next.length });
  }, []);
  const commitNow = useCallback(() => commit(itemsRef.current), [commit]);
  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current -= 1;
      setItems(historyRef.current[indexRef.current]);
      setHist({ index: indexRef.current, len: historyRef.current.length });
      setIsDirty(true);
    }
  }, []);
  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current += 1;
      setItems(historyRef.current[indexRef.current]);
      setHist({ index: indexRef.current, len: historyRef.current.length });
      setIsDirty(true);
    }
  }, []);

  // apply new items; snapshot=false for live drag (commit happens at drag-end)
  const apply = useCallback((next: CanvasItem[], snapshot = true) => {
    setItems(next);
    setIsDirty(true);
    if (snapshot) commit(next);
  }, [commit]);

  // ── item operations ──────────────────────────────────────────────────────
  const addItem = useCallback((type: string, position: { x: number; y: number }) => {
    const newItem: CanvasItem = {
      id: generateId(), type, position, size: getDefaultSize(type), label: '', bindings: {}, formatting: { decimals: 1 },
      ...(isAutomationType(type) ? { automationProps: getDefaultAutomationProps(type) } : {}),
      ...(isObcCatalogType(type) ? { obcProps: getDefaultObcProps(type) } : {}),
    };
    apply([...itemsRef.current, newItem]);
    setSelectedIds([newItem.id]);
  }, [apply]);

  // live drag/resize update — NO history snapshot (commit on mouse-up)
  const updateItemsLive = useCallback((updates: Array<{ id: string; changes: Partial<CanvasItem> }>) => {
    const map = new Map(updates.map(u => [u.id, u.changes] as const));
    apply(itemsRef.current.map(it => map.has(it.id) ? { ...it, ...map.get(it.id)! } : it), false);
  }, [apply]);

  // property-panel edit — commits
  const updateItem = useCallback((id: string, changes: Partial<CanvasItem>) => {
    apply(itemsRef.current.map(it => it.id === id ? { ...it, ...changes } : it), true);
  }, [apply]);

  const deleteSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    apply(itemsRef.current.filter(it => !ids.has(it.id)));
    setSelectedIds([]);
  }, [apply, selectedIds]);
  const deleteItem = useCallback((id: string) => {
    apply(itemsRef.current.filter(it => it.id !== id));
    setSelectedIds(s => s.filter(x => x !== id));
  }, [apply]);

  const duplicateSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    const copies = itemsRef.current.filter(it => ids.has(it.id)).map(it => ({ ...it, id: generateId(), groupId: undefined, position: { x: it.position.x + 20, y: it.position.y + 20 } }));
    if (!copies.length) return;
    apply([...itemsRef.current, ...copies]);
    setSelectedIds(copies.map(c => c.id));
  }, [apply, selectedIds]);

  const nudge = useCallback((dx: number, dy: number) => {
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, position: { x: it.position.x + dx, y: it.position.y + dy } } : it));
  }, [apply, selectedIds]);

  // group / ungroup
  const groupSelected = useCallback(() => {
    if (selectedIds.length < 2) return;
    const gid = 'grp-' + generateId();
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, groupId: gid } : it));
  }, [apply, selectedIds]);
  const ungroupSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, groupId: undefined } : it));
  }, [apply, selectedIds]);

  // align / same-size
  const alignSelected = useCallback((dir: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') => {
    const sel = itemsRef.current.filter(it => selectedIds.includes(it.id));
    if (sel.length < 2) return;
    const minX = Math.min(...sel.map(i => i.position.x));
    const maxX = Math.max(...sel.map(i => i.position.x + i.size.width));
    const minY = Math.min(...sel.map(i => i.position.y));
    const maxY = Math.max(...sel.map(i => i.position.y + i.size.height));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => {
      if (!ids.has(it.id)) return it;
      const p = { ...it.position };
      if (dir === 'left') p.x = minX;
      else if (dir === 'right') p.x = maxX - it.size.width;
      else if (dir === 'top') p.y = minY;
      else if (dir === 'bottom') p.y = maxY - it.size.height;
      else if (dir === 'centerH') p.x = Math.round(cx - it.size.width / 2);
      else if (dir === 'centerV') p.y = Math.round(cy - it.size.height / 2);
      return { ...it, position: p };
    }));
  }, [apply, selectedIds]);
  const sameSize = useCallback(() => {
    const sel = itemsRef.current.filter(it => selectedIds.includes(it.id));
    if (sel.length < 2) return;
    const { width, height } = sel[0].size;
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, size: { width, height } } : it));
  }, [apply, selectedIds]);

  // z-order / flip
  const zOrder = useCallback((dir: 'front' | 'back') => {
    const zs = itemsRef.current.map(i => i.zIndex || 0);
    const target = dir === 'front' ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1;
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, zIndex: target } : it));
  }, [apply, selectedIds]);
  const flipSelected = useCallback((axis: 'H' | 'V') => {
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, [axis === 'H' ? 'flipH' : 'flipV']: !(axis === 'H' ? it.flipH : it.flipV) } : it));
  }, [apply, selectedIds]);

  // copy / paste
  const copySelected = useCallback(() => { clipboardRef.current = itemsRef.current.filter(it => selectedIds.includes(it.id)); }, [selectedIds]);
  const paste = useCallback(() => {
    if (!clipboardRef.current.length) return;
    const copies = clipboardRef.current.map(it => ({ ...it, id: generateId(), groupId: undefined, position: { x: it.position.x + 20, y: it.position.y + 20 } }));
    apply([...itemsRef.current, ...copies]);
    setSelectedIds(copies.map(c => c.id));
  }, [apply]);

  const selectMany = useCallback((ids: string[]) => setSelectedIds(ids), []);
  const toggleSelect = useCallback((id: string) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]), []);
  const zoomBy = useCallback((f: number) => setZoom(z => Math.max(0.25, Math.min(3, z * f))), []);

  // ── keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); saveMutation.mutate(); }
      else if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
      else if (k === 'd') { e.preventDefault(); duplicateSelected(); }
      else if (k === 'c') { e.preventDefault(); copySelected(); }
      else if (k === 'v') { e.preventDefault(); paste(); }
      else if (k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSelected() : groupSelected(); }
      else if (k === 'a') { e.preventDefault(); setSelectedIds(itemsRef.current.map(i => i.id)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveMutation, undo, redo, duplicateSelected, copySelected, paste, groupSelected, ungroupSelected]);

  // Debug/test hook: expose designer state for automated verification.
  useEffect(() => {
    (window as unknown as { __designer?: unknown }).__designer = {
      items, selectedIds, histIndex: hist.index, histLen: hist.len,
    };
  }, [items, selectedIds, hist]);
  
  const selectedItem = items.find(i => i.id === selectedId);
  // Phase J — pens for the current selection (unique bound UNS tags across the selected symbols).
  const trendPens = pensFromItems(items.filter(i => selectedIds.includes(i.id)));

  if (isLoading) {
    return (
      <div className="display-designer display-designer--loading">
        <div className="display-designer__loading-spinner">⏳</div>
        <div>Loading display...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="display-designer display-designer--error">
        <div className="display-designer__error-icon">❌</div>
        <div>Failed to load display</div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['display', displayId] })}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="display-designer">
      {/* Header Toolbar */}
      <header className="display-designer__header">
        <div className="display-designer__header-left">
          <button className="display-designer__back-btn" onClick={onClose}>
            ← Back
          </button>
          <div className="display-designer__title">
            <span className="display-designer__name">{displayData?.name || 'Untitled'}</span>
            {isDirty && <span className="display-designer__dirty">●</span>}
          </div>
        </div>
        
        <div className="display-designer__header-center">
          {/* Mode Toggle */}
          <div className="display-designer__mode-toggle">
            <button
              className={`display-designer__mode-btn ${mode === 'design' ? 'active' : ''}`}
              onClick={() => setMode('design')}
            >
              ✏️ Design
            </button>
            <button
              className={`display-designer__mode-btn ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              ▶️ Preview
            </button>
          </div>
          
          {/* Zoom Controls */}
          <div className="display-designer__zoom-controls">
            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.25))}>+</button>
            <button onClick={() => setZoom(1)}>100%</button>
          </div>
        </div>
        
        <div className="display-designer__header-right">
          {/* Arrange ops (multi-select) */}
          {mode === 'design' && (
            <div className="display-designer__ops">
              <button onClick={groupSelected} disabled={selectedIds.length < 2} title="Group (Ctrl+G)">▣</button>
              <button onClick={ungroupSelected} disabled={selectedIds.length < 1} title="Ungroup (Ctrl+Shift+G)">▢</button>
              <span className="display-designer__ops-sep" />
              <button onClick={() => alignSelected('left')} disabled={selectedIds.length < 2} title="Align left">⊢</button>
              <button onClick={() => alignSelected('centerH')} disabled={selectedIds.length < 2} title="Align center-H">≑</button>
              <button onClick={() => alignSelected('right')} disabled={selectedIds.length < 2} title="Align right">⊣</button>
              <button onClick={() => alignSelected('top')} disabled={selectedIds.length < 2} title="Align top">⊤</button>
              <button onClick={() => alignSelected('bottom')} disabled={selectedIds.length < 2} title="Align bottom">⊥</button>
              <button onClick={sameSize} disabled={selectedIds.length < 2} title="Same size">▭</button>
              <span className="display-designer__ops-sep" />
              <button onClick={() => zOrder('front')} disabled={!selectedIds.length} title="Bring to front">⬆</button>
              <button onClick={() => zOrder('back')} disabled={!selectedIds.length} title="Send to back">⬇</button>
              <button onClick={() => flipSelected('H')} disabled={!selectedIds.length} title="Flip horizontal">⇄</button>
              <button onClick={() => flipSelected('V')} disabled={!selectedIds.length} title="Flip vertical">⇅</button>
              <span className="display-designer__ops-sep" />
              {/* Phase J — ad-hoc trend of the selected symbols' bound tags */}
              <button
                onClick={() => setTrendOpen(true)}
                disabled={trendPens.length === 0}
                data-testid="trend-action"
                title={trendPens.length ? `Trend ${trendPens.length} tag(s)` : 'Select symbol(s) with a bound tag'}
              >📈 Trend</button>
            </div>
          )}
          {/* History */}
          <div className="display-designer__history">
            <button onClick={undo} disabled={hist.index <= 0} title="Undo (Ctrl+Z)">↩️</button>
            <button onClick={redo} disabled={hist.index >= hist.len - 1} title="Redo (Ctrl+Y)">↪️</button>
          </div>
          
          {/* View Options */}
          <div className="display-designer__view-options">
            <label className="display-designer__checkbox">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              Grid
            </label>
            <button
              className={`display-designer__toggle ${showAssetBrowser ? 'active' : ''}`}
              onClick={() => setShowAssetBrowser(!showAssetBrowser)}
              title="Asset Browser"
            >
              🏷️
            </button>
          </div>
          
          {/* Save */}
          <button
            className="display-designer__save-btn"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
          >
            {saveMutation.isPending ? '💾 Saving...' : '💾 Save'}
          </button>

          {/* Phase L — draft/published state + publish. Editing only ever writes drafts; Operators keep
              seeing the last published version until Publish is pressed. Gated on display.publish (K). */}
          <div className="display-designer__publish" data-testid="publish-state">
            <span className="display-designer__version" data-testid="version-badges">
              Draft v{meta?.draftVersion ?? '–'}
              {' · '}
              {meta?.publishedVersion
                ? <span className="display-designer__badge--pub">Published v{meta.publishedVersion}</span>
                : <span className="display-designer__badge--unpub">Not published</span>}
              {hasUnpublishedChanges && <span className="display-designer__badge--dirty" data-testid="unpublished-badge">unpublished changes</span>}
            </span>
            {canPublish && (
              <>
                <button
                  className="display-designer__publish-btn"
                  data-testid="publish-btn"
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending || isDirty}
                  title={isDirty ? 'Save first, then publish' : 'Publish the current draft to the runtime viewer'}
                >
                  {publishMutation.isPending ? '⬆ Publishing…' : '⬆ Publish'}
                </button>
                <button
                  className="display-designer__publish-btn"
                  data-testid="unpublish-btn"
                  onClick={() => unpublishMutation.mutate()}
                  disabled={unpublishMutation.isPending || !meta?.publishedVersion}
                  title="Withdraw this display from the runtime"
                >
                  ⤫ Unpublish
                </button>
                <button
                  className="display-designer__publish-btn"
                  data-testid="revert-btn"
                  onClick={() => revertMutation.mutate()}
                  disabled={revertMutation.isPending || !meta?.publishedVersion}
                  title="Discard unpublished edits — restore the last published version as a new draft"
                >
                  ↺ Revert
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="display-designer__body">
        {/* Left Panel - Symbol Palette */}
        {mode === 'design' && (
          <aside className="display-designer__sidebar display-designer__sidebar--left">
            <SymbolPalette onAddItem={addItem} />
          </aside>
        )}
        
        {/* Center - Canvas */}
        <main className="display-designer__main">
          <DesignerCanvas
            items={items}
            selectedIds={selectedIds}
            mode={mode}
            gridSize={gridSize}
            showGrid={showGrid}
            zoom={zoom}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            onSelect={selectMany}
            onToggleSelect={toggleSelect}
            onUpdateItems={updateItemsLive}
            onCommit={commitNow}
            onAddItem={addItem}
            onDeleteSelected={deleteSelected}
            onNudge={nudge}
            onZoomBy={zoomBy}
          />
        </main>
        
        {/* Right Panel - Properties / Asset Browser */}
        {mode === 'design' && (
          <aside className="display-designer__sidebar display-designer__sidebar--right">
            {showAssetBrowser ? (
              <AssetBrowser
                selectedPath={selectedItem?.bindings?.value}
                onSelectPath={(path) => {
                  if (selectedId && selectedItem) {
                    updateItem(selectedId, {
                      bindings: { ...selectedItem.bindings, value: path }
                    });
                  }
                }}
              />
            ) : (
              <PropertyInspector
                selectedItem={selectedItem}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
                onDuplicateItem={() => duplicateSelected()}
              />
            )}
          </aside>
        )}
      </div>
      
      {/* Footer Status Bar */}
      <footer className="display-designer__footer">
        <div className="display-designer__footer-left">
          <span>{displayData?.displayType || 'overview'}</span>
          <span>•</span>
          <span>{displayData?.aspectRatio || '16:9'}</span>
        </div>
        <div className="display-designer__footer-center">
          {selectedItem && (
            <span>
              Selected: {selectedItem.type} at ({selectedItem.position.x}, {selectedItem.position.y})
            </span>
          )}
        </div>
        <div className="display-designer__footer-right">
          <span>{items.length} items</span>
          <span>•</span>
          <span>Grid: {gridSize}px</span>
        </div>
      </footer>

      {/* Phase J — ad-hoc trend over the canvas (does not touch canvas state) */}
      {trendOpen && <TrendDialog pens={trendPens} onClose={() => setTrendOpen(false)} />}
    </div>
  );
};

export default DisplayDesigner;
