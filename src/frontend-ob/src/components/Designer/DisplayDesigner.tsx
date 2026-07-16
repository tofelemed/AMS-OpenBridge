import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SymbolPalette } from './SymbolPalette';
import { PropertyInspector } from './PropertyInspector';
import { DesignerCanvas } from './DesignerCanvas';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { AssetBrowser } from './AssetBrowser';
import type { CanvasItem } from './types';
import { isAutomationType, getDefaultAutomationProps } from './automationTypes';
import { isObcCatalogType, getDefaultObcProps } from './obcCatalogTypes';
import { getDefaultSizeSync, findSymbolDefinition } from './symbolLibraryService';
import { preloadForSymbolTypes } from './lazyCategoryRegistry';
import { pensFromItems } from './TrendChart';
import DesignerToolbar from './DesignerToolbar';
import LayersPanel from './LayersPanel';
import VersionHistoryDialog from './VersionHistoryDialog';
import { renderThumbnailSvg } from './thumbnail';
import TrendDialog from './TrendDialog';
import { apiFetch } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-toastify';
import { ObiError } from '@oicl/openbridge-webcomponents-react/icons/icon-error';


const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

// Which declared slot a clicked tag binds to (mirrors SymbolRenderer's PRIMARY_VALUE_SLOTS order).
const PRIMARY_SLOT_ORDER = ['value', 'pv', 'level', 'speed', 'position', 'pressure',
  'temperature', 'current', 'flow', 'setpoint', 'sp', 'status', 'command'];

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
  /** Optional display background image (media-asset id; config-only). */
  backgroundImageId?: string;
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
interface DisplayMeta {
  draftVersion: number;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

async function fetchDisplayMeta(id: string): Promise<DisplayMeta> {
  const res = await apiFetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('Failed to load display metadata');
  const j = await res.json();
  return {
    draftVersion: j.draftVersion,
    publishedVersion: j.publishedVersion ?? null,
    publishedAt: j.publishedAt ?? null,
    publishedBy: j.publishedBy ?? null,
  };
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
// `userId` lands in display_versions.created_by, i.e. it IS the audit trail. It used to be the literal
// 'designer-user' for every save by every person, which made the trail fiction.
async function saveDisplay(id: string, content: DisplayData['content'], userId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/${id}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot: content, changeNote: 'designer save', userId })
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export const DisplayDesigner: React.FC<DisplayDesignerProps> = ({
  displayId,
  onClose,
  onSave
}) => {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore(s => s.user?.username ?? 'unknown');

  // State
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds[0] ?? null;
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(10);   // was setter-less, so the persisted value was ignored
  const [leftTab, setLeftTab] = useState<'symbols' | 'assets' | 'layers'>('symbols');
  // Snap was unconditional — you could not place anything off-grid. Alt bypasses it per-drag.
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  // Canvas background is a THEME TOKEN by default, so the canvas follows day/night like everything else.
  const [bgColor, setBgColor] = useState('var(--ams-canvas-bg)');
  // Optional display background image (media-asset id; config-only — the bytes live in the media store).
  const [bgImageId, setBgImageId] = useState<string | undefined>(undefined);
  const [trendOpen, setTrendOpen] = useState(false); // Phase J — ad-hoc trend dialog
  const [historyOpen, setHistoryOpen] = useState(false); // Phase 4 — version history browser
  // Right-click context menu (Phase 1.12) + a signal to focus a PropertyInspector tab from it.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [inspectorFocus, setInspectorFocus] = useState<{ tab: string; nonce: number } | undefined>(undefined);

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
  
  // Seed the canvas from the server — ONCE per display, not on every refetch.
  //
  // This effect used to key on the whole `displayData` object. Saving invalidates the query, the
  // refetched document always differs (the version number increments), so the effect re-ran and did
  // `setItems(server) + historyRef = [server] + index = 0`. Two real consequences:
  //   * every Save wiped the undo stack (place 3 symbols, Ctrl+S, Ctrl+Z → nothing happens);
  //   * an edit made while the save round-trip was in flight was silently reverted by the refetch.
  // The server is the source of truth only at load; after that the canvas owns the items.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!displayData?.content?.items) return;
    if (seededRef.current === displayId) return;   // already seeded this display
    seededRef.current = displayId;

    const loaded = displayData.content.items;
    setItems(loaded);
    historyRef.current = [loaded];
    indexRef.current = 0;
    setHist({ index: 0, len: 1 });

    const s = displayData.content.settings;
    if (s?.canvasWidth && s?.canvasHeight) setCanvasSize({ width: s.canvasWidth, height: s.canvasHeight });
    // Round-trip the rest of the settings too — showGrid/gridSize/backgroundColor used to be written
    // on every save but never read back, so the saved values were unreachable.
    if (typeof s?.showGrid === 'boolean') setShowGrid(s.showGrid);
    if (s?.gridSize) setGridSize(s.gridSize);
    if (s?.backgroundColor) setBgColor(s.backgroundColor);
    setBgImageId(s?.backgroundImageId || undefined);
  }, [displayData, displayId]);

  /** Re-seed the canvas from the server on purpose (used by Revert, which replaces the draft). */
  const reseedFromServer = useCallback(async () => {
    seededRef.current = null;
    await queryClient.invalidateQueries({ queryKey: ['display', displayId] });
  }, [queryClient, displayId]);

  useEffect(() => { if (items.length > 0) preloadForSymbolTypes(items.map(i => i.type)); }, [items]);

  // Save mutation.
  // NOTE: backgroundColor used to be the literal '#0f172a' here. Every save stamped dark navy into the
  // display document — overwriting imported displays that correctly stored a theme token — and the
  // viewer applies it as an inline style, so the canvas could never follow day/night. It is now
  // whatever the display actually has (default: the theme token).
  const saveMutation = useMutation({
    mutationFn: () => saveDisplay(displayId, {
      items,
      settings: { gridSize, showGrid, backgroundColor: bgColor, backgroundImageId: bgImageId, canvasWidth: canvasSize.width, canvasHeight: canvasSize.height },
    }, currentUser),
    onSuccess: () => {
      setIsDirty(false);
      toast.success('Display saved');
      queryClient.invalidateQueries({ queryKey: ['display-meta', displayId] });
      queryClient.invalidateQueries({ queryKey: ['displays'] });          // refresh the list badges
      queryClient.invalidateQueries({ queryKey: ['launcher-displays'] });
      onSave?.();
    },
    // A failed save used to be completely silent: no onError, no toast — the button just re-enabled
    // itself and the engineer walked away believing the work was persisted.
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
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

  // Invalidate the metadata AND both list pages, so the Draft/Published badges elsewhere don't sit
  // stale for staleTime (30s) after a publish.
  const invalidateMeta = () => {
    queryClient.invalidateQueries({ queryKey: ['display-meta', displayId] });
    queryClient.invalidateQueries({ queryKey: ['displays'] });
    queryClient.invalidateQueries({ queryKey: ['launcher-displays'] });
  };
  const publishMutation = useMutation({
    mutationFn: async () => {
      await publishDisplay(displayId);
      // Regenerate the preview on PUBLISH only — never on autosave (you'd melt the browser), and always
      // from the design-mode model, so a thumbnail can never capture a live process value.
      const svg = renderThumbnailSvg({
        items, width: canvasSize.width, height: canvasSize.height, background: bgColor,
      });
      await apiFetch(`${API_BASE}/${displayId}/thumbnail`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ svg }),
      }).catch(() => { /* a missing thumbnail must never fail a publish */ });
    },
    onSuccess: () => { invalidateMeta(); toast.success('Published to the runtime'); },
    onError: (e: Error) => toast.error(`Publish failed: ${e.message}`),
  });
  const unpublishMutation = useMutation({
    mutationFn: () => unpublishDisplay(displayId),
    onSuccess: () => { invalidateMeta(); toast.info('Withdrawn from the runtime'); },
    onError: (e: Error) => toast.error(`Unpublish failed: ${e.message}`),
  });
  const revertMutation = useMutation({
    mutationFn: () => revertDisplay(displayId),
    // Revert replaces the draft on the SERVER, so the canvas has to be re-seeded from it — otherwise
    // the editor keeps showing the discarded edits.
    onSuccess: async () => {
      invalidateMeta();
      setIsDirty(false);
      await reseedFromServer();
      toast.success('Reverted to the published version');
    },
    onError: (e: Error) => toast.error(`Revert failed: ${e.message}`),
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
  /** The slot a tag binds to when you click it in the asset tree: the symbol's declared primary. */
  const primarySlotFor = useCallback((item: CanvasItem): string | undefined => {
    const slots = findSymbolDefinition(item.type)?.bindingSlots;
    if (!slots?.length) return 'value';
    return slots.find(s => PRIMARY_SLOT_ORDER.includes(s)) ?? slots[0];
  }, []);

  /**
   * Bulk property edit — ONE pass over the items, ONE undo entry (never N).
   *
   * `patch` may be a function so a caller can merge into each item's OWN nested object
   * (`i => ({ size: { ...i.size, width: 150 } })`). Calling this once per item in a loop would NOT work:
   * `itemsRef.current` only updates after a render, so each iteration would overwrite the previous one
   * and only the last item would keep the edit.
   */
  const updateMany = useCallback((
    ids: string[],
    patch: Partial<CanvasItem> | ((item: CanvasItem) => Partial<CanvasItem>),
  ) => {
    const set = new Set(ids);
    apply(itemsRef.current.map(it =>
      set.has(it.id) ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it), true);
  }, [apply]);

  const updateItem = useCallback((id: string, changes: Partial<CanvasItem>) => {
    apply(itemsRef.current.map(it => it.id === id ? { ...it, ...changes } : it), true);
  }, [apply]);

  // Drag-a-tag-from-the-tree gestures (B18/B19). Drop on empty canvas → a bound value readout;
  // drop on a symbol → add the tag to its next free binding slot.
  const addBoundSymbol = useCallback((path: string, position: { x: number; y: number }) => {
    const type = 'obc.readout-unit';
    const leaf = path.split('/').pop() ?? path;
    const newItem: CanvasItem = {
      id: generateId(), type, position, size: getDefaultSize(type),
      label: leaf, bindings: { value: path }, formatting: { decimals: 1 },
    };
    apply([...itemsRef.current, newItem]);
    setSelectedIds([newItem.id]);
    toast.success(`Added ${leaf}`);
  }, [apply]);

  const bindTagToItem = useCallback((id: string, path: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (!item) return;
    const slots = findSymbolDefinition(item.type)?.bindingSlots ?? [];
    const bound = item.bindings ?? {};
    const slot = slots.find(s => !bound[s]) ?? primarySlotFor(item) ?? 'value';
    updateItem(id, { bindings: { ...bound, [slot]: path } });
    toast.success(`Bound ${slot} → ${path.split('/').pop()}`);
  }, [primarySlotFor, updateItem]);

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

  // Convert-to-collection (§I) — wrap the selection into a repeating container. The cell items keep
  // their relative positions; the container repeats once per matching asset at runtime.
  const convertToCollection = useCallback(() => {
    const sel = itemsRef.current.filter(it => selectedIds.includes(it.id));
    if (!sel.length) return;
    const minX = Math.min(...sel.map(i => i.position.x));
    const minY = Math.min(...sel.map(i => i.position.y));
    const maxX = Math.max(...sel.map(i => i.position.x + i.size.width));
    const maxY = Math.max(...sel.map(i => i.position.y + i.size.height));
    const cellW = Math.max(20, maxX - minX);
    const cellH = Math.max(20, maxY - minY);
    const cellItems = sel.map(it => ({ ...it, position: { x: it.position.x - minX, y: it.position.y - minY }, groupId: undefined }));
    const container: CanvasItem = {
      id: generateId(), type: 'collection.container',
      position: { x: minX, y: minY },
      size: { width: cellW * 2 + 24, height: cellH * 3 + 40 },
      collectionConfig: {
        criteria: { returnAllDescendants: true },
        cell: { width: cellW, height: cellH },
        columns: 2, gap: 12, items: cellItems, maxInstances: 24,
      },
    };
    const selSet = new Set(selectedIds);
    apply([...itemsRef.current.filter(it => !selSet.has(it.id)), container]);
    setSelectedIds([container.id]);
    toast.success('Converted to collection — set criteria in the inspector');
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

  // z-order / flip. front/back jump past everything; forward/backward step one level.
  const zOrder = useCallback((dir: 'front' | 'back' | 'forward' | 'backward') => {
    const ids = new Set(selectedIds);
    if (dir === 'front' || dir === 'back') {
      const zs = itemsRef.current.map(i => i.zIndex || 0);
      const target = dir === 'front' ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1;
      apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, zIndex: target } : it));
    } else {
      const delta = dir === 'forward' ? 1 : -1;
      apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, zIndex: (it.zIndex || 0) + delta } : it));
    }
  }, [apply, selectedIds]);

  // distribute — even spacing of ≥3 items by their top-left along one axis.
  const distributeSelected = useCallback((axis: 'h' | 'v') => {
    const key: 'x' | 'y' = axis === 'h' ? 'x' : 'y';
    const sel = itemsRef.current.filter(it => selectedIds.includes(it.id));
    if (sel.length < 3) return;
    const sorted = [...sel].sort((a, b) => a.position[key] - b.position[key]);
    const start = sorted[0].position[key];
    const end = sorted[sorted.length - 1].position[key];
    const gap = (end - start) / (sorted.length - 1);
    const targets = new Map<string, number>();
    sorted.forEach((it, i) => {
      if (i > 0 && i < sorted.length - 1) targets.set(it.id, Math.round(start + gap * i));
    });
    apply(itemsRef.current.map(it =>
      targets.has(it.id) ? { ...it, position: { ...it.position, [key]: targets.get(it.id)! } } : it));
  }, [apply, selectedIds]);
  const flipSelected = useCallback((axis: 'H' | 'V') => {
    const ids = new Set(selectedIds);
    apply(itemsRef.current.map(it => ids.has(it.id) ? { ...it, [axis === 'H' ? 'flipH' : 'flipV']: !(axis === 'H' ? it.flipH : it.flipV) } : it));
  }, [apply, selectedIds]);

  // cut / copy / paste
  const copySelected = useCallback(() => { clipboardRef.current = itemsRef.current.filter(it => selectedIds.includes(it.id)); }, [selectedIds]);
  const cut = useCallback(() => {
    const sel = itemsRef.current.filter(it => selectedIds.includes(it.id));
    if (!sel.length) return;
    clipboardRef.current = sel;
    const ids = new Set(selectedIds);
    apply(itemsRef.current.filter(it => !ids.has(it.id)));
    setSelectedIds([]);
  }, [apply, selectedIds]);
  const paste = useCallback(() => {
    if (!clipboardRef.current.length) return;
    const copies = clipboardRef.current.map(it => ({ ...it, id: generateId(), groupId: undefined, position: { x: it.position.x + 20, y: it.position.y + 20 } }));
    apply([...itemsRef.current, ...copies]);
    setSelectedIds(copies.map(c => c.id));
  }, [apply]);

  const selectMany = useCallback((ids: string[]) => setSelectedIds(ids), []);
  const toggleSelect = useCallback((id: string) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]), []);
  const zoomBy = useCallback((f: number) => setZoom(z => Math.max(0.25, Math.min(3, z * f))), []);

  // Right-click context menu (Phase 1.12). Selecting the item first makes the inspector reflect it.
  const ctxNonce = useRef(0);
  const focusInspectorTab = useCallback((tab: string) => {
    ctxNonce.current += 1;
    setInspectorFocus({ tab, nonce: ctxNonce.current });
  }, []);
  const handleItemContextMenu = useCallback((e: React.MouseEvent, item: CanvasItem) => {
    e.preventDefault();
    setSelectedIds(sel => (sel.includes(item.id) ? sel : [item.id]));
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

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
      else if (k === 'x') { e.preventDefault(); cut(); }
      else if (k === 'v') { e.preventDefault(); paste(); }
      else if (k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSelected() : groupSelected(); }
      else if (k === 'a') { e.preventDefault(); setSelectedIds(itemsRef.current.map(i => i.id)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveMutation, undo, redo, duplicateSelected, copySelected, cut, paste, groupSelected, ungroupSelected]);

  // ── Full screen + fit-to-screen ───────────────────────────────────────────
  // The designer is a full-viewport route (outside the app shell), so "full screen" here is the real
  // browser fullscreen — the same affordance the runtime viewer has.
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await rootRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }, []);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /** Zoom so the whole artboard fits the canvas well (there was no fit/zoom-to-fit anywhere). */
  const fitToScreen = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    const pad = 48; // matches the wrapper padding
    const z = Math.min(
      (el.clientWidth - pad) / canvasSize.width,
      (el.clientHeight - pad) / canvasSize.height,
    );
    setZoom(Math.max(0.1, Math.min(3, Number(z.toFixed(2)))));
  }, [canvasSize]);

  // Unsaved-changes guard. There was none: "← Back", a sidebar click, a refresh or a tab close all
  // discarded the work silently. This covers the browser-level exits; `closeDesigner` covers in-app ones.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';   // required for Chrome to show the native prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const closeDesigner = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Leave the designer and discard them?')) return;
    onClose?.();
  }, [isDirty, onClose]);

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
        <div className="display-designer__loading-spinner" />
        <div>Loading display...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="display-designer display-designer--error">
        <div className="display-designer__error-icon"><ObiError /></div>
        <div>Failed to load display</div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['display', displayId] })}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="display-designer" ref={rootRef}>
      <DesignerToolbar
        name={displayData?.name || 'Untitled'}
        isDirty={isDirty}
        mode={mode}
        setMode={setMode}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        onBack={closeDesigner}
        zoom={zoom}
        setZoom={setZoom}
        fitToScreen={fitToScreen}
        histIndex={hist.index}
        histLen={hist.len}
        undo={undo}
        redo={redo}
        selectedCount={selectedIds.length}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
        onAlign={alignSelected}
        onDistribute={distributeSelected}
        onSameSize={sameSize}
        onZOrder={zOrder}
        onFlip={flipSelected}
        trendCount={trendPens.length}
        onTrend={() => setTrendOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        snapEnabled={snapEnabled}
        setSnapEnabled={setSnapEnabled}
        bgColor={bgColor}
        setBgColor={(c) => { setBgColor(c); setIsDirty(true); }}
        bgImageId={bgImageId}
        setBgImageId={(id) => { setBgImageId(id); setIsDirty(true); }}
        showAssets={leftTab === 'assets'}
        toggleAssets={() => { setLeftTab(t => (t === 'assets' ? 'symbols' : 'assets')); setLeftCollapsed(false); }}
        canvasSize={canvasSize}
        setCanvasSize={(s) => { setCanvasSize(s); setIsDirty(true); }}
        onSave={() => saveMutation.mutate()}
        saving={saveMutation.isPending}
        canPublish={canPublish}
        meta={meta}
        hasUnpublishedChanges={hasUnpublishedChanges}
        onPublish={() => publishMutation.mutate()}
        onUnpublish={() => unpublishMutation.mutate()}
        onRevert={() => {
          if (window.confirm('Discard all unpublished edits and restore the last published version?')) {
            revertMutation.mutate();
          }
        }}
        publishing={publishMutation.isPending || unpublishMutation.isPending || revertMutation.isPending}
      />
      
      {/* Main Content */}
      <div className="display-designer__body">
        {/* Left panel — SOURCES (symbols + assets), tabbed.
            The asset tree used to live on the RIGHT and *replaced* the property inspector, so you could
            never see the tag tree and the symbol's binding slots at the same time — which made binding
            any slot other than `value` physically impossible. PI Vision (and Ignition, and WinCC) put
            sources on the left and properties on the right for exactly this reason. */}
        {mode === 'design' && !leftCollapsed && (
          <aside className="display-designer__sidebar display-designer__sidebar--left">
            <div className="ds-tabs" role="tablist">
              <button
                className={`ds-tab${leftTab === 'symbols' ? ' active' : ''}`}
                onClick={() => setLeftTab('symbols')}
                role="tab" aria-selected={leftTab === 'symbols'}
                data-testid="tab-symbols"
              >Symbols</button>
              <button
                className={`ds-tab${leftTab === 'assets' ? ' active' : ''}`}
                onClick={() => setLeftTab('assets')}
                role="tab" aria-selected={leftTab === 'assets'}
                data-testid="tab-assets"
              >Assets</button>
              <button
                className={`ds-tab${leftTab === 'layers' ? ' active' : ''}`}
                onClick={() => setLeftTab('layers')}
                role="tab" aria-selected={leftTab === 'layers'}
                data-testid="tab-layers"
              >Layers</button>
              <span className="ds-tabs__spacer" />
              <button className="ds-collapse" onClick={() => setLeftCollapsed(true)} title="Collapse panel">‹</button>
            </div>
            <div className="ds-panel-body">
              {leftTab === 'layers' ? (
                <LayersPanel
                  items={items}
                  selectedIds={selectedIds}
                  onSelect={selectMany}
                  onUpdateItem={updateItem}
                />
              ) : leftTab === 'symbols'
                ? <SymbolPalette onAddItem={addItem} />
                : (
                  <AssetBrowser
                    selectedPath={selectedItem?.bindings?.value}
                    // Clicking a tag binds the selected symbol's PRIMARY slot (PI Vision's drag-to-bind
                    // gesture). Every other slot is bound from the inspector's Data tab, which is now
                    // visible at the same time.
                    onSelectPath={(path) => {
                      if (!selectedId || !selectedItem) {
                        toast.info('Select a symbol on the canvas first, then pick a tag.');
                        return;
                      }
                      const slot = primarySlotFor(selectedItem) ?? 'value';
                      updateItem(selectedId, { bindings: { ...selectedItem.bindings, [slot]: path } });
                      toast.success(`Bound ${slot} → ${path.split('/').pop()}`);
                    }}
                  />
                )}
            </div>
          </aside>
        )}
        {mode === 'design' && leftCollapsed && (
          <button className="ds-rail" onClick={() => setLeftCollapsed(false)} title="Show panel">›</button>
        )}

        {/* Center - Canvas */}
        <main className="display-designer__main" ref={mainRef}>
          <DesignerCanvas
            items={items}
            selectedIds={selectedIds}
            mode={mode}
            gridSize={gridSize}
            showGrid={showGrid}
            zoom={zoom}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            canvasBg={bgColor}
            canvasBgImage={bgImageId}
            snapEnabled={snapEnabled}
            onSelect={selectMany}
            onToggleSelect={toggleSelect}
            onUpdateItems={updateItemsLive}
            onCommit={commitNow}
            onAddItem={addItem}
            onDeleteSelected={deleteSelected}
            onNudge={nudge}
            onZoomBy={zoomBy}
            onItemContextMenu={handleItemContextMenu}
            onBindTag={bindTagToItem}
            onAddBoundSymbol={addBoundSymbol}
          />
        </main>
        
        {/* Right panel — PROPERTIES, always visible (never swapped out for the asset tree). */}
        {mode === 'design' && (
          <aside className="display-designer__sidebar display-designer__sidebar--right">
            <PropertyInspector
              selectedItems={items.filter(i => selectedIds.includes(i.id))}
              onUpdateItem={updateItem}
              onUpdateMany={updateMany}
              onDeleteItem={deleteItem}
              onDuplicateItem={() => duplicateSelected()}
              focusTab={inspectorFocus}
            />
          </aside>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={([
            { label: 'Cut', onClick: cut, disabled: !selectedIds.length },
            { label: 'Copy', onClick: copySelected, disabled: !selectedIds.length },
            { label: 'Paste', onClick: paste, disabled: !clipboardRef.current.length },
            { label: 'Duplicate', onClick: duplicateSelected, disabled: !selectedIds.length },
            { label: 'Delete', onClick: deleteSelected, disabled: !selectedIds.length, danger: true, divider: true },
            { label: 'Bring to front', onClick: () => zOrder('front'), divider: true },
            { label: 'Bring forward', onClick: () => zOrder('forward') },
            { label: 'Send backward', onClick: () => zOrder('backward') },
            { label: 'Send to back', onClick: () => zOrder('back') },
            { label: 'Convert to collection', onClick: convertToCollection, disabled: !selectedIds.length, divider: true },
            { label: 'Format…', onClick: () => focusInspectorTab('style'), divider: true },
            { label: 'Edit states…', onClick: () => focusInspectorTab('states') },
            { label: 'Add navigation link…', onClick: () => focusInspectorTab('action') },
          ] as ContextMenuItem[])}
        />
      )}
      
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

      {/* Phase 4 — version history browser (compare / restore / change notes) */}
      <VersionHistoryDialog
        displayId={displayId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={() => { setHistoryOpen(false); setIsDirty(false); void reseedFromServer(); }}
      />
    </div>
  );
};

export default DisplayDesigner;
