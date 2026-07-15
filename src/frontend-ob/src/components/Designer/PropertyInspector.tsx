import React, { useState } from 'react';
import type { CanvasItem, FormattingOptions, ItemStyle, AlarmLimits, NavigationLink, MultiStateConfig, MultiStateItem, CollectionCriteria, TrendTrace, StateMapEntry } from './types';
import { compatibleUnits } from '../../utils/uom';

// Phase 8 (B35) — a simple "format painter": copy one symbol's visual style + formatting, paste onto
// another. Module-level so it survives selection changes within the session.
let formatClipboard: { style?: ItemStyle; formatting?: FormattingOptions } | null = null;
import type { AutomationProps } from './automationTypes';
import { isAutomationType } from './automationTypes';
import type { ObcProps } from './obcCatalogTypes';
import { isObcCatalogType } from './obcCatalogTypes';
import { toast } from 'react-toastify';
import { TagPicker } from './AssetBrowser';
import NavigationEditor from './NavigationEditor';
import { uploadMedia } from '../../api/mediaApi';
import { findSymbolDefinition } from './symbolLibraryService';
import { ObiPlaceholder } from '@oicl/openbridge-webcomponents-react/icons/icon-placeholder';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import { ObiDelete } from '@oicl/openbridge-webcomponents-react/icons/icon-delete';

interface PropertyInspectorProps {
  /** The whole selection. With N>1 the inspector edits ALL of them (it used to silently edit only the
      first, which quietly discarded the user's intent on every multi-select edit). */
  selectedItems: CanvasItem[];
  onUpdateItem: (id: string, updates: Partial<CanvasItem>) => void;
  /** Bulk edit — one patch applied to every selected id, as ONE undo entry. */
  onUpdateMany: (ids: string[], patch: Partial<CanvasItem> | ((item: CanvasItem) => Partial<CanvasItem>)) => void;
  onDeleteItem?: (id: string) => void;
  onDuplicateItem?: (id: string) => void;
  /** External request to focus a tab (e.g. from the canvas context menu). Nonce forces re-fire. */
  focusTab?: { tab: string; nonce: number };
}

/** Sentinel for "the selection disagrees about this property". */
const MIXED = Symbol('mixed');

/** The shared value of a property across the selection, or MIXED. */
function common<T>(items: CanvasItem[], get: (i: CanvasItem) => T): T | typeof MIXED {
  const first = get(items[0]);
  return items.every(i => Object.is(get(i), first)) ? first : MIXED;
}

/**
 * Bulk property editing (PI Vision calls this "Format Symbols").
 *
 * Two rules taken straight from PI Vision, because they are the right ones:
 *  1. A property whose value DIFFERS across the selection renders BLANK — and is never seeded from
 *     item[0]'s value. (Seeding from the first item is precisely how the legacy app silently stamped
 *     item[0]'s geometry onto everything else.) Leaving a field untouched leaves each item alone.
 *  2. Some properties are single-selection only. Bindings are the important one: PI Vision refuses bulk
 *     binding, and the legacy code in this repo says why — "configure data bindings for each element
 *     individually to ensure precise industrial traceability". Raw X/Y is excluded too: writing one
 *     absolute X to five symbols stacks them on top of each other, which is never what anyone meant.
 *     Use Align/Distribute for that.
 */
const MultiSelectPanel: React.FC<{
  items: CanvasItem[];
  onUpdateMany: (ids: string[], patch: Partial<CanvasItem> | ((item: CanvasItem) => Partial<CanvasItem>)) => void;
  onDelete?: (id: string) => void;
}> = ({ items, onUpdateMany, onDelete }) => {
  const ids = items.map(i => i.id);
  // Merge into each item's OWN style so the other style properties survive.
  const patchStyle = (key: keyof ItemStyle, value: unknown) =>
    onUpdateMany(ids, (i) => ({ style: { ...i.style, [key]: value } as ItemStyle }));

  const fill = common(items, i => i.style?.fill);
  const stroke = common(items, i => i.style?.stroke);
  const strokeWidth = common(items, i => i.style?.strokeWidth);
  const width = common(items, i => i.size?.width);
  const height = common(items, i => i.size?.height);
  const rotation = common(items, i => i.rotation ?? 0);
  const locked = common(items, i => !!i.locked);
  const hidden = common(items, i => !!i.hidden);

  const val = <T,>(v: T | typeof MIXED): string => (v === MIXED || v === undefined ? '' : String(v));
  const mixedTitle = (v: unknown) => (v === MIXED ? 'Values differ across the selection' : undefined);

  return (
    <div className="property-inspector" data-testid="multi-inspector">
      <div className="property-inspector__header">
        <h3>Properties</h3>
        <div className="property-inspector__actions">
          {onDelete && (
            <button
              className="property-inspector__action property-inspector__action--danger"
              onClick={() => items.forEach(i => onDelete(i.id))}
              title="Delete all selected"
            ><ObiDelete /></button>
          )}
        </div>
      </div>

      <div className="property-inspector__multi" data-testid="multi-count">
        {items.length} symbols selected — edits apply to all of them
      </div>

      <div className="property-inspector__content">
        <div className="property-section">
          <div className="property-section__title">Size</div>
          <div className="property-row">
            <label className="property-label">W</label>
            <input
              className="property-input" type="number" data-testid="multi-width"
              placeholder={width === MIXED ? 'Mixed' : ''} title={mixedTitle(width)}
              value={val(width)}
              onChange={e => {
                const n = Number(e.target.value);
                if (!e.target.value || !Number.isFinite(n)) return;   // never coerce empty → 0
                onUpdateMany(ids, (i) => ({ size: { ...i.size, width: n } }));
              }}
            />
            <label className="property-label">H</label>
            <input
              className="property-input" type="number"
              placeholder={height === MIXED ? 'Mixed' : ''} title={mixedTitle(height)}
              value={val(height)}
              onChange={e => {
                const n = Number(e.target.value);
                if (!e.target.value || !Number.isFinite(n)) return;
                onUpdateMany(ids, (i) => ({ size: { ...i.size, height: n } }));
              }}
            />
          </div>
          <div className="property-hint">
            Position is single-selection only — use Align / Distribute to move a group.
          </div>
        </div>

        <div className="property-section">
          <div className="property-section__title">Transform</div>
          <div className="property-row">
            <label className="property-label">Rotation</label>
            <input
              className="property-input" type="number"
              placeholder={rotation === MIXED ? 'Mixed' : ''} title={mixedTitle(rotation)}
              value={val(rotation)}
              onChange={e => {
                const n = Number(e.target.value);
                if (!e.target.value || !Number.isFinite(n)) return;
                onUpdateMany(ids, { rotation: n });
              }}
            />
          </div>
          <label className="property-checkbox">
            <input
              type="checkbox" data-testid="multi-locked"
              checked={locked === true}
              ref={el => { if (el) el.indeterminate = locked === MIXED; }}
              onChange={e => onUpdateMany(ids, { locked: e.target.checked })}
            />
            <span>Locked</span>
          </label>
          <label className="property-checkbox">
            <input
              type="checkbox" data-testid="multi-hidden"
              checked={hidden === true}
              ref={el => { if (el) el.indeterminate = hidden === MIXED; }}
              onChange={e => onUpdateMany(ids, { hidden: e.target.checked })}
            />
            <span>Hidden</span>
          </label>
        </div>

        <div className="property-section">
          <div className="property-section__title">Style</div>
          <div className="property-row">
            <label className="property-label">Fill</label>
            <input
              className="property-input" type="text" data-testid="multi-fill"
              placeholder={fill === MIXED ? 'Mixed' : 'e.g. var(--ams-run)'} title={mixedTitle(fill)}
              value={val(fill)}
              onChange={e => patchStyle('fill', e.target.value)}
            />
          </div>
          <div className="property-row">
            <label className="property-label">Stroke</label>
            <input
              className="property-input" type="text"
              placeholder={stroke === MIXED ? 'Mixed' : ''} title={mixedTitle(stroke)}
              value={val(stroke)}
              onChange={e => patchStyle('stroke', e.target.value)}
            />
          </div>
          <div className="property-row">
            <label className="property-label">Stroke width</label>
            <input
              className="property-input" type="number"
              placeholder={strokeWidth === MIXED ? 'Mixed' : ''} title={mixedTitle(strokeWidth)}
              value={val(strokeWidth)}
              onChange={e => {
                const n = Number(e.target.value);
                if (!e.target.value || !Number.isFinite(n)) return;
                patchStyle('strokeWidth', n);
              }}
            />
          </div>
        </div>

        <div className="property-section">
          <div className="property-hint">
            Data bindings, labels and alarm limits are edited one symbol at a time — binding several
            symbols at once would break tag traceability.
          </div>
        </div>
      </div>
    </div>
  );
};

// Get symbol definition from library
function getSymbolDef(type: string) {
  return findSymbolDefinition(type);
}

// Color presets for quick selection
const COLOR_PRESETS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#0f172a', '#000000', 'transparent'
];

// ── Multi-state authoring (Phase 1) ─────────────────────────────────────────
// ISA-101 / G-COLOR guardrail: the state colour is a CONSTRAINED OpenBridge alert-token
// palette, never a free colour picker. Saturated colour is reserved for abnormal states.
const STATE_PALETTE: { key: string; label: string; value: string }[] = [
  { key: 'normal',   label: 'Normal',   value: 'var(--ams-run)' },
  { key: 'advisory', label: 'Advisory', value: 'var(--ams-advisory)' },
  { key: 'caution',  label: 'Caution',  value: 'var(--ams-caut)' },
  { key: 'warning',  label: 'Warning',  value: 'var(--ams-warn)' },
  { key: 'alarm',    label: 'Alarm',    value: 'var(--ams-crit)' },
];
// Mandatory bad-data / no-data appearance (G19 / NE107) — a muted grey, distinct from any live state.
const BAD_DATA_COLOR = 'var(--element-inactive-color, #757575)';

const SwatchRow: React.FC<{
  palette: { key: string; label: string; value: string }[];
  selected?: string;
  onPick: (value: string) => void;
}> = ({ palette, selected, onPick }) => (
  <div className="ms-swatches">
    {palette.map(p => (
      <button
        key={p.key}
        type="button"
        title={p.label}
        aria-label={p.label}
        aria-pressed={selected === p.value}
        className={`ms-swatch${selected === p.value ? ' ms-swatch--active' : ''}`}
        style={{ background: p.value }}
        onClick={() => onPick(p.value)}
      />
    ))}
  </div>
);

/**
 * Multi-state authoring. Writes `item.multiStateConfig`; the existing ruleEngine
 * (evaluateMultiState) + SymbolFxWrap already RENDER it (colour outline + blink) for every
 * symbol type. This UI is the missing authoring half — no new evaluator (G-ENGINE).
 */
const MultiStateEditor: React.FC<{
  item: CanvasItem;
  slots: string[];
  onChange: (cfg: MultiStateConfig | undefined) => void;
}> = ({ item, slots, onChange }) => {
  const cfg = item.multiStateConfig;

  if (!cfg) {
    return (
      <div className="property-section">
        <div className="property-hint">
          Multi-state changes the symbol's colour when its value crosses a threshold.
          A bad-data / no-data state is required (ISA-18.2 / NE107): stale or missing data must
          never render as a live value.
        </div>
        <button
          type="button"
          className="ms-btn"
          data-testid="add-multistate"
          onClick={() => onChange({
            slot: undefined,
            states: [
              { max: 50, label: 'Normal', color: 'var(--ams-run)' },
              { min: 50, label: 'Alarm', color: 'var(--ams-crit)', blink: true },
            ],
            default: { label: 'No data', color: BAD_DATA_COLOR },
          })}
        >
          + Add Multi-State
        </button>
      </div>
    );
  }

  const update = (patch: Partial<MultiStateConfig>) => onChange({ ...cfg, ...patch });
  const updateState = (idx: number, patch: Partial<MultiStateItem>) =>
    update({ states: cfg.states.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  const numOrUndef = (v: string): number | undefined => (v === '' ? undefined : Number(v));

  return (
    <div data-testid="multistate-editor">
      {/* Trigger slot — the "alternate trigger attribute" (G11): drive the colour from a
          different bound attribute than the one displayed. */}
      <div className="property-section">
        <div className="property-section__title">Trigger attribute</div>
        <select
          className="property-input"
          data-testid="ms-trigger"
          value={cfg.slot ?? ''}
          onChange={e => update({ slot: e.target.value || undefined })}
        >
          <option value="">Primary value (this symbol)</option>
          {slots.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* States */}
      <div className="property-section">
        <div className="property-section__title">States</div>
        {cfg.states.map((s, i) => (
          <div key={i} className="ms-state" data-testid="ms-state">
            <input
              className="property-input ms-state__label"
              placeholder="Label"
              value={s.label ?? ''}
              onChange={e => updateState(i, { label: e.target.value })}
            />
            <div className="ms-state__range">
              <input
                className="property-input" type="number" placeholder="min"
                value={s.min ?? ''}
                onChange={e => updateState(i, { min: numOrUndef(e.target.value) })}
              />
              <span className="ms-state__dash">–</span>
              <input
                className="property-input" type="number" placeholder="max"
                value={s.max ?? ''}
                onChange={e => updateState(i, { max: numOrUndef(e.target.value) })}
              />
            </div>
            <SwatchRow palette={STATE_PALETTE} selected={s.color} onPick={c => updateState(i, { color: c })} />
            <label className="ms-state__blink">
              <input
                type="checkbox"
                checked={!!s.blink}
                onChange={e => updateState(i, { blink: e.target.checked })}
              />
              Blink
            </label>
            <button
              type="button"
              className="property-inspector__action property-inspector__action--danger"
              title="Remove state"
              onClick={() => update({ states: cfg.states.filter((_, j) => j !== i) })}
            >
              <ObiDelete />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ms-btn"
          data-testid="ms-add-state"
          onClick={() => update({ states: [...cfg.states, { min: 0, label: `State ${cfg.states.length + 1}`, color: 'var(--ams-caut)' }] })}
        >
          + Add state
        </button>
      </div>

      {/* Mandatory bad-data / no-data state (G19) */}
      <div className="property-section">
        <div className="property-section__title">No data / bad quality</div>
        <div className="ms-state">
          <input
            className="property-input ms-state__label"
            placeholder="No data"
            value={cfg.default?.label ?? ''}
            onChange={e => update({ default: { ...cfg.default, label: e.target.value } })}
          />
          <SwatchRow
            palette={[...STATE_PALETTE, { key: 'bad', label: 'Bad data', value: BAD_DATA_COLOR }]}
            selected={cfg.default?.color ?? BAD_DATA_COLOR}
            onPick={c => update({ default: { ...cfg.default, color: c } })}
          />
        </div>
        <div className="property-hint">
          Shown when the value is missing or matches no state.
        </div>
      </div>

      <button
        type="button"
        className="ms-btn ms-btn--danger"
        data-testid="remove-multistate"
        onClick={() => onChange(undefined)}
      >
        Remove Multi-State
      </button>
    </div>
  );
};

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  selectedItems,
  onUpdateItem,
  onUpdateMany,
  onDeleteItem,
  onDuplicateItem,
  focusTab,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'bindings' | 'style' | 'limits' | 'states' | 'action'>('general');
  // Let the canvas context menu jump straight to a tab (Format… / Edit states… / Add nav link…).
  React.useEffect(() => {
    if (focusTab) setActiveTab(focusTab.tab as typeof activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTab?.nonce]);
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : undefined;

  if (selectedItems.length === 0) {
    return (
      <div className="property-inspector">
        <div className="property-inspector__header">
          <h3>Properties</h3>
        </div>
        <div className="property-inspector__empty">
          <div className="property-inspector__empty-icon"><ObiPlaceholder /></div>
          <p>Select an item to edit its properties</p>
          <small>Click on any element on the canvas</small>
        </div>
      </div>
    );
  }

  // N>1 → bulk editor (was: silently edited only selectedIds[0]).
  if (!selectedItem) {
    return <MultiSelectPanel items={selectedItems} onUpdateMany={onUpdateMany} onDelete={onDeleteItem} />;
  }

  const symbolDef = getSymbolDef(selectedItem.type);
  const bindingSlots = symbolDef?.bindingSlots || [];
  const hasAlarmLimits = symbolDef?.hasAlarmLimits || false;
  
  const updateItem = (updates: Partial<CanvasItem>) => {
    onUpdateItem(selectedItem.id, updates);
  };
  
  const updateBinding = (slot: string, path: string) => {
    updateItem({
      bindings: { ...selectedItem.bindings, [slot]: path }
    });
  };
  
  const updateFormatting = (key: keyof FormattingOptions, value: unknown) => {
    updateItem({
      formatting: { ...selectedItem.formatting, [key]: value } as FormattingOptions
    });
  };
  
  const updateStyle = (key: keyof ItemStyle, value: unknown) => {
    updateItem({
      style: { ...selectedItem.style, [key]: value } as ItemStyle
    });
  };
  
  const updateAlarmLimits = (key: keyof AlarmLimits, value: number | undefined) => {
    updateItem({
      alarmLimits: { ...selectedItem.alarmLimits, [key]: value }
    });
  };

  const updateCollectionCriteria = (patch: Partial<CollectionCriteria>) => {
    const cfg = selectedItem.collectionConfig;
    if (!cfg) return;
    updateItem({ collectionConfig: { ...cfg, criteria: { ...cfg.criteria, ...patch } } });
  };
  const updateCollectionLayout = (patch: Partial<{ columns: number; gap: number }>) => {
    const cfg = selectedItem.collectionConfig;
    if (!cfg) return;
    updateItem({ collectionConfig: { ...cfg, ...patch } });
  };

  const comparisonDefault = { criteria: { returnAllDescendants: true } as CollectionCriteria, attributes: [] as string[] };
  const updateComparison = (patch: Partial<{ criteria: CollectionCriteria; attributes: string[] }>) => {
    const cur = selectedItem.comparison ?? comparisonDefault;
    updateItem({ comparison: { ...cur, ...patch } });
  };
  const updateComparisonCriteria = (patch: Partial<CollectionCriteria>) => {
    const cur = selectedItem.comparison ?? comparisonDefault;
    updateItem({ comparison: { ...cur, criteria: { ...cur.criteria, ...patch } } });
  };

  const toggleSummaryColumn = (col: 'min' | 'max' | 'avg') => {
    const cur = selectedItem.summaryColumns ?? [];
    const next = cur.includes(col) ? cur.filter(c => c !== col) : [...cur, col];
    updateItem({ summaryColumns: next.length ? next : undefined });
  };

  // ── Phase 6 authoring helpers ─────────────────────────────────────────────────
  const setTrace = (path: string, patch: Partial<TrendTrace>) =>
    updateItem({ trace: { ...(selectedItem.trace ?? {}), [path]: { ...(selectedItem.trace?.[path] ?? {}), ...patch } } });
  const setTrendScale = (patch: Partial<NonNullable<CanvasItem['trendScale']>>) =>
    updateItem({ trendScale: { ...(selectedItem.trendScale ?? { auto: true }), ...patch } });
  const setStateMap = (rows: StateMapEntry[]) => updateItem({ stateMap: rows.length ? rows : undefined });
  // Pens bound on a trend = every binding slot that carries a UNS path.
  const trendPenPaths = Object.values(selectedItem.bindings ?? {}).filter(p => typeof p === 'string' && p.includes('/')) as string[];
  // UOM options: units of the same dimension as the tag's current unit (per-item display-unit switch).
  const uomOptions = compatibleUnits(selectedItem.uom || selectedItem.formatting?.unit);
  const isValueSymbol = /readout|gauge|numeric|value|ind\./.test(selectedItem.type) || (findSymbolDefinition(selectedItem.type)?.hasAlarmLimits ?? false);

  const updateAutomation = (key: keyof AutomationProps, value: unknown) => {
    updateItem({
      automationProps: { ...selectedItem.automationProps, [key]: value } as AutomationProps
    });
  };

  const updateObc = (key: keyof ObcProps, value: unknown) => {
    updateItem({
      obcProps: { ...selectedItem.obcProps, [key]: value } as ObcProps
    });
  };

  const ap = selectedItem.automationProps ?? {};
  const op = selectedItem.obcProps ?? {};
  const isAutomation = isAutomationType(selectedItem.type);
  const isObcCatalog = isObcCatalogType(selectedItem.type);
  const isLine = selectedItem.type.startsWith('obc.auto.') && selectedItem.type.includes('line');
  const isTank = selectedItem.type.includes('automation-tank');
  const isValve = selectedItem.type.includes('valve');
  const isMotorized = ['pump', 'motor', 'fan'].some(k => selectedItem.type.includes(k));
  const isSequence = selectedItem.type.includes('sequence');
  
  const updatePosition = (axis: 'x' | 'y', value: number) => {
    updateItem({ position: { ...selectedItem.position, [axis]: value } });
  };
  
  const updateSize = (dim: 'width' | 'height', value: number) => {
    updateItem({ size: { ...selectedItem.size, [dim]: value } });
  };
  
  return (
    <div className="property-inspector">
      <div className="property-inspector__header">
        <h3>Properties</h3>
        <div className="property-inspector__actions">
          {onDuplicateItem && (
            <button
              className="property-inspector__action"
              onClick={() => onDuplicateItem(selectedItem.id)}
              title="Duplicate"
            >
              <ObiContentCopyGoogle />
            </button>
          )}
          {onDeleteItem && (
            <button
              className="property-inspector__action property-inspector__action--danger"
              onClick={() => onDeleteItem(selectedItem.id)}
              title="Delete"
            >
              <ObiDelete />
            </button>
          )}
        </div>
      </div>
      
      <div className="property-inspector__type-badge">
        {symbolDef?.label || selectedItem.type}
      </div>
      
      {/* Tabs */}
      <div className="property-inspector__tabs">
        <button
          className={`property-inspector__tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        {bindingSlots.length > 0 && (
          <button
            className={`property-inspector__tab ${activeTab === 'bindings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bindings')}
          >
            Data
          </button>
        )}
        <button
          className={`property-inspector__tab ${activeTab === 'style' ? 'active' : ''}`}
          onClick={() => setActiveTab('style')}
        >
          Style
        </button>
        {hasAlarmLimits && (
          <button
            className={`property-inspector__tab ${activeTab === 'limits' ? 'active' : ''}`}
            onClick={() => setActiveTab('limits')}
          >
            Limits
          </button>
        )}
        {/* Multi-state authoring — the runtime (ruleEngine + SymbolFxWrap) has rendered
            multiStateConfig since Phase F, but nothing could author it. Available on every
            symbol type (the fx wrapper is universal). */}
        <button
          className={`property-inspector__tab ${activeTab === 'states' ? 'active' : ''}`}
          onClick={() => setActiveTab('states')}
          data-testid="tab-states"
        >
          States{selectedItem.multiStateConfig ? ' •' : ''}
        </button>
        {/* Navigation authoring — the runtime has honored navigationLink since Phase D, but there was
            no way to author one, so no multi-screen HMI could be built here. */}
        <button
          className={`property-inspector__tab ${activeTab === 'action' ? 'active' : ''}`}
          onClick={() => setActiveTab('action')}
          data-testid="tab-action"
        >
          Action{selectedItem.navigationLink ? ' •' : ''}
        </button>
      </div>

      {activeTab === 'states' && (
        <MultiStateEditor
          item={selectedItem}
          slots={bindingSlots}
          onChange={(multiStateConfig: MultiStateConfig | undefined) => updateItem({ multiStateConfig })}
        />
      )}

      {activeTab === 'action' && (
        <NavigationEditor
          item={selectedItem}
          onChange={(navigationLink: NavigationLink | undefined) => updateItem({ navigationLink })}
        />
      )}
      
      <div className="property-inspector__content">
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* GENERAL TAB */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'general' && (
          <>
            <div className="property-section">
              <div className="property-section__title">Label</div>
              <div className="property-group">
                <input
                  type="text"
                  value={selectedItem.label || ''}
                  onChange={(e) => updateItem({ label: e.target.value })}
                  placeholder="Display label"
                  className="property-input"
                />
              </div>
            </div>

            {/* Phase 8 (B35) — format painter: copy this symbol's style + formatting, paste onto another. */}
            <div className="property-section">
              <div className="property-section__title">Format</div>
              <div className="property-group" style={{ display: 'flex', gap: 6 }}>
                <button
                  className="property-button" data-testid="format-copy"
                  onClick={() => { formatClipboard = { style: selectedItem.style, formatting: selectedItem.formatting }; }}
                >Copy format</button>
                <button
                  className="property-button" data-testid="format-paste"
                  disabled={!formatClipboard}
                  onClick={() => { if (formatClipboard) updateItem({ style: { ...formatClipboard.style }, formatting: { ...formatClipboard.formatting } }); }}
                >Paste format</button>
              </div>
            </div>

            {/* Phase 8 (B34/B35) — switch a value symbol to a compatible display type. All of these bind a
                single `value`, so bindings, formatting and alarm limits carry over unchanged. */}
            {['obc.readout', 'obc.readout-unit', 'ind.gauge', 'ind.digital'].includes(selectedItem.type) && (
              <div className="property-section">
                <div className="property-section__title">Symbol type</div>
                <div className="property-group">
                  <select
                    className="property-select"
                    data-testid="symbol-type-switch"
                    value={selectedItem.type}
                    onChange={(e) => updateItem({ type: e.target.value })}
                  >
                    <option value="obc.readout">Numeric Readout</option>
                    <option value="obc.readout-unit">Readout + Unit</option>
                    <option value="ind.gauge">Circular Gauge</option>
                    <option value="ind.digital">Digital Display</option>
                  </select>
                </div>
                <div className="property-hint">Bindings, formatting and limits are preserved.</div>
              </div>
            )}

            {/* Alarm binding — drives the priority-coloured outline / blink-on-unacked (useSymbolAlarm)
                and the alarm.table filter. The runtime has honored alarmSource since Phase F; this is
                the missing authoring field. */}
            <div className="property-section">
              <div className="property-section__title">Alarm source</div>
              <div className="property-group">
                <input
                  type="text"
                  data-testid="alarm-source"
                  value={selectedItem.alarmSource || ''}
                  onChange={(e) => updateItem({ alarmSource: e.target.value || undefined })}
                  placeholder="Alarm source name (prefix), e.g. site1:unit1:pump101"
                  className="property-input"
                />
              </div>
              <div className="property-hint">
                Binds this symbol to live alarms whose source name starts with this value —
                the symbol outlines and blinks while unacknowledged.
              </div>
            </div>

            {/* Asset comparison table (§E5) — rows from a search, columns = attributes. */}
            {selectedItem.type === 'table.compare' && (
              <div className="property-section">
                <div className="property-section__title">Rows — asset search</div>
                <input
                  className="property-input"
                  data-testid="compare-root"
                  value={selectedItem.comparison?.criteria.root ?? ''}
                  onChange={(e) => updateComparisonCriteria({ root: e.target.value || undefined })}
                  placeholder="Search root, e.g. site1/unit1"
                />
                <input
                  className="property-input"
                  style={{ marginTop: 6 }}
                  data-testid="compare-template"
                  value={selectedItem.comparison?.criteria.template ?? ''}
                  onChange={(e) => updateComparisonCriteria({ template: e.target.value || undefined })}
                  placeholder="Template / type, e.g. Tank"
                />
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={selectedItem.comparison?.criteria.returnAllDescendants ?? true}
                    onChange={(e) => updateComparisonCriteria({ returnAllDescendants: e.target.checked })}
                  />
                  Return all descendants
                </label>
                <div className="property-section__title" style={{ marginTop: 10 }}>Columns — attributes</div>
                <input
                  className="property-input"
                  data-testid="compare-attributes"
                  value={(selectedItem.comparison?.attributes ?? []).join(', ')}
                  onChange={(e) => updateComparison({ attributes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="Comma-separated, e.g. level, flow, temperature"
                />
                <div className="property-hint">Each cell reads <code>{'{asset path}.{attribute}'}</code> live.</div>
              </div>
            )}

            {/* Table summary columns (E4.5–E4.7) — aggregates over the display time range. */}
            {selectedItem.type === 'table.value' && (
              <div className="property-section">
                <div className="property-section__title">Summary columns</div>
                {(['min', 'max', 'avg'] as const).map(c => (
                  <label key={c} className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      data-testid={`table-summary-${c}`}
                      checked={(selectedItem.summaryColumns ?? []).includes(c)}
                      onChange={() => toggleSummaryColumn(c)}
                    />
                    {c === 'min' ? 'Minimum' : c === 'max' ? 'Maximum' : 'Average'}
                  </label>
                ))}
                <div className="property-hint">Computed over the display time range via the historian.</div>
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    data-testid="table-transpose"
                    checked={selectedItem.transpose ?? false}
                    onChange={(e) => updateItem({ transpose: e.target.checked || undefined })}
                  />
                  Transpose (tags across the top)
                </label>
              </div>
            )}

            {/* Phase 6 — value fidelity: UOM switch, quality badge, timestamp, digital state map. */}
            {isValueSymbol && (
              <div className="property-section">
                <div className="property-section__title">Value display (Phase 6)</div>
                <label className="property-hint">Display unit (converts from the tag's native unit)</label>
                <select
                  className="property-input"
                  data-testid="uom-select"
                  value={selectedItem.uom ?? ''}
                  onChange={(e) => updateItem({ uom: e.target.value || undefined })}
                >
                  <option value="">Native (no conversion)</option>
                  {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {uomOptions.length === 0 && (
                  <div className="property-hint">Set a unit in the Format tab to enable unit conversion.</div>
                )}
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    data-testid="show-quality"
                    checked={selectedItem.showQuality ?? false}
                    onChange={(e) => updateItem({ showQuality: e.target.checked || undefined })}
                  />
                  Show data-quality badge (ISA-18.2 / NE107)
                </label>
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    data-testid="inherit-limits"
                    checked={selectedItem.inheritLimits ?? true}
                    onChange={(e) => updateItem({ inheritLimits: e.target.checked })}
                  />
                  Inherit alarm thresholds from the asset
                </label>
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    data-testid="show-timestamp"
                    checked={selectedItem.showTimestamp ?? false}
                    onChange={(e) => updateItem({ showTimestamp: e.target.checked || undefined })}
                  />
                  Show sample timestamp
                </label>

                <div className="property-section__title" style={{ marginTop: 10 }}>State map (value → label)</div>
                {(selectedItem.stateMap ?? []).map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    <input
                      className="property-input" style={{ flex: '0 0 64px' }} placeholder="value"
                      value={String(row.when)}
                      onChange={(e) => {
                        const rows = [...(selectedItem.stateMap ?? [])];
                        rows[i] = { ...row, when: e.target.value };
                        setStateMap(rows);
                      }}
                    />
                    <input
                      className="property-input" style={{ flex: 1 }} placeholder="label"
                      value={row.label}
                      onChange={(e) => {
                        const rows = [...(selectedItem.stateMap ?? [])];
                        rows[i] = { ...row, label: e.target.value };
                        setStateMap(rows);
                      }}
                    />
                    <input
                      type="color" title="colour" value={row.color ?? '#888888'}
                      onChange={(e) => {
                        const rows = [...(selectedItem.stateMap ?? [])];
                        rows[i] = { ...row, color: e.target.value };
                        setStateMap(rows);
                      }}
                    />
                    <button className="property-icon-btn" title="remove"
                      onClick={() => setStateMap((selectedItem.stateMap ?? []).filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                <button
                  className="property-btn" data-testid="add-state-map"
                  onClick={() => setStateMap([...(selectedItem.stateMap ?? []), { when: '', label: '' }])}
                >+ Add state</button>
                <div className="property-hint">Maps a discrete reading (e.g. 0/1 or "OPEN") to a label + colour.</div>
              </div>
            )}

            {/* Phase 6 — trend depth: per-trace style, manual scale, stepped plotting. */}
            {selectedItem.type === 'chart.trend' && (
              <div className="property-section">
                <div className="property-section__title">Trend traces (Phase 6)</div>
                {trendPenPaths.length === 0 && <div className="property-hint">Bind tag(s) to configure traces.</div>}
                {trendPenPaths.map((path) => {
                  const t = selectedItem.trace?.[path] ?? {};
                  return (
                    <div key={path} style={{ borderTop: '1px solid var(--border-divider-color)', paddingTop: 6, marginTop: 6 }}>
                      <div className="property-hint" style={{ fontWeight: 600 }}>{path.split('/').pop()}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                        <input type="color" title="trace colour" value={t.color ?? '#4a90d9'}
                          onChange={(e) => setTrace(path, { color: e.target.value })} />
                        <select className="property-input" style={{ flex: 1 }} value={t.style ?? 'solid'}
                          onChange={(e) => setTrace(path, { style: e.target.value as TrendTrace['style'] })}>
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="dotted">Dotted</option>
                        </select>
                        <input className="property-input" style={{ flex: '0 0 56px' }} type="number" min={0.5} step={0.5}
                          title="line width" value={t.width ?? 1.5}
                          onChange={(e) => setTrace(path, { width: e.target.value ? Number(e.target.value) : undefined })} />
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                        <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={t.showMarkers ?? false}
                            onChange={(e) => setTrace(path, { showMarkers: e.target.checked || undefined })} />
                          Markers
                        </label>
                        <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={t.hidden ?? false}
                            onChange={(e) => setTrace(path, { hidden: e.target.checked || undefined })} />
                          Hidden by default
                        </label>
                      </div>
                    </div>
                  );
                })}

                <div className="property-section__title" style={{ marginTop: 10 }}>Y-axis scale</div>
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" data-testid="trend-autoscale"
                    checked={selectedItem.trendScale?.auto ?? true}
                    onChange={(e) => setTrendScale({ auto: e.target.checked })} />
                  Auto-scale
                </label>
                {selectedItem.trendScale?.auto === false && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="property-input" type="number" placeholder="min"
                      value={selectedItem.trendScale?.min ?? ''}
                      onChange={(e) => setTrendScale({ min: e.target.value ? Number(e.target.value) : undefined })} />
                    <input className="property-input" type="number" placeholder="max"
                      value={selectedItem.trendScale?.max ?? ''}
                      onChange={(e) => setTrendScale({ max: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                )}
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <input type="checkbox" data-testid="trend-stepped"
                    checked={selectedItem.steppedLines ?? false}
                    onChange={(e) => updateItem({ steppedLines: e.target.checked || undefined })} />
                  Stepped plotting
                </label>
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" data-testid="trend-regression"
                    checked={selectedItem.showRegression ?? false}
                    onChange={(e) => updateItem({ showRegression: e.target.checked || undefined })} />
                  Regression (trend line)
                </label>
                <div className="property-hint">Click a legend entry in the running trend to hide/show that trace.</div>
              </div>
            )}

            {/* Dynamic search criteria on a bar chart (§J) — one bar per matching asset. */}
            {selectedItem.type === 'chart.bar' && (
              <div className="property-section">
                <div className="property-section__title">Dynamic search (optional)</div>
                <input
                  className="property-input"
                  data-testid="bar-search-root"
                  value={selectedItem.comparison?.criteria.root ?? ''}
                  onChange={(e) => updateComparisonCriteria({ root: e.target.value || undefined })}
                  placeholder="Search root, e.g. site1/unit1"
                />
                <input
                  className="property-input"
                  style={{ marginTop: 6 }}
                  value={selectedItem.comparison?.criteria.template ?? ''}
                  onChange={(e) => updateComparisonCriteria({ template: e.target.value || undefined })}
                  placeholder="Template / type, e.g. Tank"
                />
                <input
                  className="property-input"
                  style={{ marginTop: 6 }}
                  data-testid="bar-search-attribute"
                  value={selectedItem.comparison?.attributes?.[0] ?? ''}
                  onChange={(e) => updateComparison({ attributes: e.target.value.trim() ? [e.target.value.trim()] : [] })}
                  placeholder="Attribute per bar, e.g. level"
                />
                <div className="property-hint">Set a search to make one bar per matching asset (overrides the Data tab). Leave the attribute blank to use fixed bindings.</div>
              </div>
            )}

            {/* Collection criteria (§I) — which assets the cell repeats over. */}
            {selectedItem.type === 'collection.container' && selectedItem.collectionConfig && (
              <div className="property-section">
                <div className="property-section__title">Collection criteria</div>
                <input
                  className="property-input"
                  data-testid="collection-root"
                  value={selectedItem.collectionConfig.criteria.root ?? ''}
                  onChange={(e) => updateCollectionCriteria({ root: e.target.value || undefined })}
                  placeholder="Search root, e.g. site1/unit1"
                />
                <input
                  className="property-input"
                  style={{ marginTop: 6 }}
                  data-testid="collection-template"
                  value={selectedItem.collectionConfig.criteria.template ?? ''}
                  onChange={(e) => updateCollectionCriteria({ template: e.target.value || undefined })}
                  placeholder="Asset type / template, e.g. Tank"
                />
                <label className="property-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!selectedItem.collectionConfig.criteria.returnAllDescendants}
                    onChange={(e) => updateCollectionCriteria({ returnAllDescendants: e.target.checked })}
                  />
                  Return all descendants
                </label>
                <select
                  className="property-input"
                  style={{ marginTop: 6 }}
                  value={selectedItem.collectionConfig.criteria.assetType ?? ''}
                  onChange={(e) => updateCollectionCriteria({ assetType: e.target.value ? Number(e.target.value) : undefined })}
                >
                  <option value="">Any level</option>
                  <option value={3}>Unit</option>
                  <option value={4}>Device</option>
                  <option value={5}>Measurement</option>
                </select>
                <div className="property-row" style={{ marginTop: 6 }}>
                  <label className="property-label">Cols</label>
                  <input
                    className="property-input" type="number" min={1}
                    value={selectedItem.collectionConfig.columns}
                    onChange={(e) => updateCollectionLayout({ columns: Math.max(1, Number(e.target.value)) })}
                  />
                  <label className="property-label">Gap</label>
                  <input
                    className="property-input" type="number" min={0}
                    value={selectedItem.collectionConfig.gap}
                    onChange={(e) => updateCollectionLayout({ gap: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
                <select
                  className="property-input"
                  style={{ marginTop: 6 }}
                  data-testid="collection-sort"
                  value={selectedItem.collectionConfig.sort ? `${selectedItem.collectionConfig.sort.by}:${selectedItem.collectionConfig.sort.dir}` : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    const cfg = selectedItem.collectionConfig!;
                    if (!v) { updateItem({ collectionConfig: { ...cfg, sort: undefined } }); return; }
                    const [by, dir] = v.split(':') as ['name' | 'path', 'asc' | 'desc'];
                    updateItem({ collectionConfig: { ...cfg, sort: { by, dir } } });
                  }}
                >
                  <option value="">Unsorted</option>
                  <option value="name:asc">Name ↑</option>
                  <option value="name:desc">Name ↓</option>
                  <option value="path:asc">Path ↑</option>
                  <option value="path:desc">Path ↓</option>
                </select>
                <div className="property-hint">Cells use <code>{'{{element}}'}</code> in bindings — each instance binds to one matching asset.</div>
              </div>
            )}

            {/* Image upload (C19/C21) — bytes go to the media store; the item keeps only the id. */}
            {selectedItem.type === 'image.static' && (
              <div className="property-section">
                <div className="property-section__title">Image</div>
                <input
                  type="file"
                  data-testid="image-upload"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const { id } = await uploadMedia(file);
                      updateItem({ mediaId: id });
                      toast.success('Image uploaded');
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Upload failed');
                    }
                  }}
                />
                {selectedItem.mediaId && <div className="property-hint">Uploaded ✓ — replace by choosing another file.</div>}
              </div>
            )}

            {/* Per-symbol time context (K17 / E1.23) — trend symbols follow the display time bar by
                default, or keep their own independent range controls. */}
            {selectedItem.type === 'chart.trend' && (
              <div className="property-section">
                <div className="property-section__title">Time range</div>
                <select
                  className="property-input"
                  data-testid="trend-time-mode"
                  value={selectedItem.timeMode ?? 'display'}
                  onChange={(e) => updateItem({ timeMode: e.target.value === 'own' ? 'own' : 'display' })}
                >
                  <option value="display">Follow display time bar</option>
                  <option value="own">Own range (independent controls)</option>
                </select>
              </div>
            )}

            <div className="property-section">
              <div className="property-section__title">Position</div>
              <div className="property-row">
                <div className="property-group property-group--half">
                  <label>X</label>
                  <input
                    type="number"
                    value={selectedItem.position.x}
                    onChange={(e) => updatePosition('x', Number(e.target.value))}
                    className="property-input"
                  />
                </div>
                <div className="property-group property-group--half">
                  <label>Y</label>
                  <input
                    type="number"
                    value={selectedItem.position.y}
                    onChange={(e) => updatePosition('y', Number(e.target.value))}
                    className="property-input"
                  />
                </div>
              </div>
            </div>
            
            <div className="property-section">
              <div className="property-section__title">Size</div>
              <div className="property-row">
                <div className="property-group property-group--half">
                  <label>Width</label>
                  <input
                    type="number"
                    min="10"
                    value={selectedItem.size.width}
                    onChange={(e) => updateSize('width', Number(e.target.value))}
                    className="property-input"
                  />
                </div>
                <div className="property-group property-group--half">
                  <label>Height</label>
                  <input
                    type="number"
                    min="10"
                    value={selectedItem.size.height}
                    onChange={(e) => updateSize('height', Number(e.target.value))}
                    className="property-input"
                  />
                </div>
              </div>
            </div>
            
            <div className="property-section">
              <div className="property-section__title">Transform</div>
              <div className="property-group">
                <label>Rotation (deg)</label>
                <input
                  type="number"
                  min="-360"
                  max="360"
                  step="15"
                  value={selectedItem.rotation || 0}
                  onChange={(e) => updateItem({ rotation: Number(e.target.value) })}
                  className="property-input"
                />
              </div>
              <div className="property-group">
                <label>Z-Index</label>
                <input
                  type="number"
                  value={selectedItem.zIndex || 0}
                  onChange={(e) => updateItem({ zIndex: Number(e.target.value) })}
                  className="property-input"
                />
              </div>
              <div className="property-group">
                <label className="property-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedItem.locked || false}
                    onChange={(e) => updateItem({ locked: e.target.checked })}
                  />
                  <span>Locked</span>
                </label>
              </div>
            </div>

            {isAutomation && (
              <div className="property-section">
                <div className="property-section__title">Automation</div>
                <div className="property-section__hint">
                  OpenBridge automation symbol properties
                </div>

                {(isMotorized || isValve || selectedItem.type.includes('damper') || selectedItem.type.includes('switch')) && (
                  <div className="property-group">
                    <label className="property-checkbox">
                      <input
                        type="checkbox"
                        checked={ap.on ?? ap.open ?? false}
                        onChange={(e) => {
                          if (isValve) updateAutomation('open', e.target.checked);
                          else updateAutomation('on', e.target.checked);
                        }}
                      />
                      <span>{isValve ? 'Open' : 'Running / ON'}</span>
                    </label>
                  </div>
                )}

                {(isMotorized || isValve) && (
                  <div className="property-group">
                    <label className="property-checkbox">
                      <input
                        type="checkbox"
                        checked={ap.vertical ?? false}
                        onChange={(e) => updateAutomation('vertical', e.target.checked)}
                      />
                      <span>Vertical orientation</span>
                    </label>
                  </div>
                )}

                {isMotorized && (
                  <div className="property-group">
                    <label>Speed (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={ap.speedInPercent ?? 100}
                      onChange={(e) => updateAutomation('speedInPercent', Number(e.target.value))}
                      className="property-input"
                    />
                  </div>
                )}

                {(isValve || selectedItem.type.includes('valve-')) && (
                  <>
                    <div className="property-group">
                      <label>Position / Value (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={ap.value ?? 50}
                        onChange={(e) => updateAutomation('value', Number(e.target.value))}
                        className="property-input"
                      />
                    </div>
                    {selectedItem.type.includes('three-way') && (
                      <div className="property-group">
                        <label>Position 2 (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={ap.value2 ?? 50}
                          onChange={(e) => updateAutomation('value2', Number(e.target.value))}
                          className="property-input"
                        />
                      </div>
                    )}
                    <div className="property-group">
                      <label className="property-checkbox">
                        <input
                          type="checkbox"
                          checked={ap.closed ?? false}
                          onChange={(e) => updateAutomation('closed', e.target.checked)}
                        />
                        <span>Closed</span>
                      </label>
                    </div>
                  </>
                )}

                {isLine && (
                  <>
                    <div className="property-group">
                      <label>Medium</label>
                      <select
                        value={ap.medium ?? 'water'}
                        onChange={(e) => updateAutomation('medium', e.target.value)}
                        className="property-input"
                      >
                        <option value="normal">Normal</option>
                        <option value="empty">Empty</option>
                        <option value="water">Water</option>
                        <option value="air">Air</option>
                      </select>
                    </div>
                    <div className="property-group">
                      <label>Line type</label>
                      <select
                        value={ap.lineType ?? 'fluid'}
                        onChange={(e) => updateAutomation('lineType', e.target.value)}
                        className="property-input"
                      >
                        <option value="fluid">Fluid</option>
                        <option value="electric">Electric</option>
                        <option value="air">Air</option>
                        <option value="connector">Connector</option>
                      </select>
                    </div>
                    {(selectedItem.type.includes('horizontal') || selectedItem.type.includes('vertical')) && (
                      <div className="property-group">
                        <label>Length (px)</label>
                        <input
                          type="number"
                          min={10}
                          value={ap.length ?? selectedItem.size.width}
                          onChange={(e) => updateAutomation('length', Number(e.target.value))}
                          className="property-input"
                        />
                      </div>
                    )}
                    {selectedItem.type.includes('corner') && (
                      <div className="property-group">
                        <label>Corner direction</label>
                        <select
                          value={ap.direction ?? 'top-right'}
                          onChange={(e) => updateAutomation('direction', e.target.value)}
                          className="property-input"
                        >
                          <option value="top-right">Top right</option>
                          <option value="top-left">Top left</option>
                          <option value="bottom-right">Bottom right</option>
                          <option value="bottom-left">Bottom left</option>
                        </select>
                      </div>
                    )}
                    {selectedItem.type.includes('three-way-line') && (
                      <div className="property-group">
                        <label>Branch direction</label>
                        <select
                          value={ap.direction ?? 'top'}
                          onChange={(e) => updateAutomation('direction', e.target.value)}
                          className="property-input"
                        >
                          <option value="top">Top</option>
                          <option value="right">Right</option>
                          <option value="bottom">Bottom</option>
                          <option value="left">Left</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {isTank && (
                  <>
                    <div className="property-group">
                      <label>Tag ID</label>
                      <input
                        type="text"
                        value={ap.tag ?? ''}
                        onChange={(e) => updateAutomation('tag', e.target.value)}
                        className="property-input"
                        placeholder="TK-101"
                      />
                    </div>
                    <div className="property-group">
                      <label>Trend</label>
                      <select
                        value={ap.trend ?? 'stable'}
                        onChange={(e) => updateAutomation('trend', e.target.value)}
                        className="property-input"
                      >
                        <option value="fast-rising">Fast rising</option>
                        <option value="rising">Rising</option>
                        <option value="stable">Stable</option>
                        <option value="falling">Falling</option>
                        <option value="fast-falling">Fast falling</option>
                      </select>
                    </div>
                    <div className="property-group">
                      <label>Max level</label>
                      <input
                        type="number"
                        min={1}
                        value={ap.max ?? 100}
                        onChange={(e) => updateAutomation('max', Number(e.target.value))}
                        className="property-input"
                      />
                    </div>
                  </>
                )}

                {selectedItem.type.includes('readout') && (
                  <div className="property-group">
                    <label>Digits</label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={ap.numberOfDigits ?? 3}
                      onChange={(e) => updateAutomation('numberOfDigits', Number(e.target.value))}
                      className="property-input"
                    />
                  </div>
                )}

                {isSequence && (
                  <>
                    <div className="property-group">
                      <label>Step state</label>
                      <select
                        value={ap.sequenceValue ?? 'regular'}
                        onChange={(e) => updateAutomation('sequenceValue', e.target.value)}
                        className="property-input"
                      >
                        <option value="not-started">Not started</option>
                        <option value="loading">Loading</option>
                        <option value="regular">Regular</option>
                        <option value="next">Next</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div className="property-group">
                      <label>Subtitle</label>
                      <input
                        type="text"
                        value={ap.subtitle ?? ''}
                        onChange={(e) => updateAutomation('subtitle', e.target.value)}
                        className="property-input"
                      />
                    </div>
                  </>
                )}

                <div className="property-group">
                  <label className="property-checkbox">
                    <input
                      type="checkbox"
                      checked={ap.showReadoutStack ?? false}
                      onChange={(e) => updateAutomation('showReadoutStack', e.target.checked)}
                    />
                    <span>Show readout stack</span>
                  </label>
                </div>
              </div>
            )}

            {isObcCatalog && (
              <div className="property-section">
                <div className="property-section__title">▣ OpenBridge</div>
                <div className="property-section__hint">
                  Component-specific OpenBridge properties
                </div>

                {(selectedItem.type.includes('gauge') || selectedItem.type.includes('bar') || selectedItem.type.includes('instrument') || selectedItem.type.includes('thruster') || selectedItem.type.includes('depth') || selectedItem.type.includes('speed') || selectedItem.type.includes('graph')) && (
                  <>
                    <div className="property-row">
                      <div className="property-group property-group--half">
                        <label>Min</label>
                        <input type="number" value={op.minValue ?? 0} onChange={(e) => updateObc('minValue', Number(e.target.value))} className="property-input" />
                      </div>
                      <div className="property-group property-group--half">
                        <label>Max</label>
                        <input type="number" value={op.maxValue ?? 100} onChange={(e) => updateObc('maxValue', Number(e.target.value))} className="property-input" />
                      </div>
                    </div>
                    <div className="property-group">
                      <label>Design value</label>
                      <input type="number" value={op.value ?? 50} onChange={(e) => updateObc('value', Number(e.target.value))} className="property-input" />
                    </div>
                  </>
                )}

                {selectedItem.type.includes('gauge-radial') && (
                  <div className="property-group">
                    <label>Gauge type</label>
                    <select value={op.gaugeType ?? 'needle'} onChange={(e) => updateObc('gaugeType', e.target.value)} className="property-input">
                      <option value="needle">Needle</option>
                      <option value="filled">Filled</option>
                      <option value="bar">Bar</option>
                    </select>
                  </div>
                )}

                {(selectedItem.type.includes('toggle') || selectedItem.type.includes('checkbox') || selectedItem.type.includes('check-button') || selectedItem.type.includes('radio')) && (
                  <div className="property-group">
                    <label className="property-checkbox">
                      <input type="checkbox" checked={op.checked ?? false} onChange={(e) => updateObc('checked', e.target.checked)} />
                      <span>Checked / ON</span>
                    </label>
                  </div>
                )}

                {selectedItem.type.includes('battery') && (
                  <>
                    <div className="property-group">
                      <label>Level (%)</label>
                      <input type="number" min={0} max={100} value={op.level ?? 75} onChange={(e) => updateObc('level', Number(e.target.value))} className="property-input" />
                    </div>
                    <div className="property-group">
                      <label className="property-checkbox">
                        <input type="checkbox" checked={op.charging ?? false} onChange={(e) => updateObc('charging', e.target.checked)} />
                        <span>Charging</span>
                      </label>
                    </div>
                  </>
                )}

                {selectedItem.type.includes('status-indicator') && (
                  <div className="property-group">
                    <label>Status</label>
                    <select value={op.status ?? 'active'} onChange={(e) => updateObc('status', e.target.value)} className="property-input">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="running">Running</option>
                      <option value="caution">Caution</option>
                      <option value="warning">Warning</option>
                      <option value="alarm">Alarm</option>
                    </select>
                  </div>
                )}

                {(selectedItem.type.includes('alert') || selectedItem.type.includes('alert-button')) && (
                  <div className="property-group">
                    <label>Alert type</label>
                    <select value={op.alertType ?? 'caution'} onChange={(e) => updateObc('alertType', e.target.value)} className="property-input">
                      <option value="alarm">Alarm</option>
                      <option value="warning">Warning</option>
                      <option value="caution">Caution</option>
                      <option value="notice">Notice</option>
                    </select>
                  </div>
                )}

                {selectedItem.type.includes('circular-progress') && (
                  <div className="property-group">
                    <label>Progress mode</label>
                    <select value={op.progressMode ?? 'determinate'} onChange={(e) => updateObc('progressMode', e.target.value)} className="property-input">
                      <option value="determinate">Determinate</option>
                      <option value="indeterminate">Indeterminate</option>
                      <option value="progressive-indeterminate">Progressive</option>
                    </select>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* BINDINGS TAB */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'bindings' && (
          <>
            <div className="property-section">
              <div className="property-section__title">Data Bindings</div>
              <div className="property-section__hint">
                Connect this element to live process data
              </div>
              
              {bindingSlots.map(slot => (
                <div key={slot} className="property-group">
                  <label className="property-label--binding">
                    {slot.charAt(0).toUpperCase() + slot.slice(1)}
                    <span className="property-label__slot">{slot}</span>
                  </label>
                  <TagPicker
                    value={selectedItem.bindings?.[slot] || ''}
                    onChange={(path) => updateBinding(slot, path)}
                    placeholder={`Select tag for ${slot}...`}
                  />
                </div>
              ))}
              
              {bindingSlots.length === 0 && (
                <div className="property-empty">
                  This element has no data bindings
                </div>
              )}
            </div>
            
            {/* Formatting options for numeric displays */}
            {(selectedItem.type.includes('readout') || selectedItem.type.includes('gauge') || selectedItem.type.includes('bar') || selectedItem.type.includes('digital') || selectedItem.type.includes('setpoint')) && (
              <div className="property-section">
                <div className="property-section__title">Formatting</div>
                <div className="property-row">
                  <div className="property-group property-group--half">
                    <label>Decimals</label>
                    <input
                      type="number"
                      min="0"
                      max="6"
                      value={selectedItem.formatting?.decimals ?? 1}
                      onChange={(e) => updateFormatting('decimals', Number(e.target.value))}
                      className="property-input"
                    />
                  </div>
                  <div className="property-group property-group--half">
                    <label>Unit</label>
                    <input
                      type="text"
                      value={selectedItem.formatting?.unit || ''}
                      onChange={(e) => updateFormatting('unit', e.target.value)}
                      placeholder="PSI, °C, m³/h"
                      className="property-input"
                    />
                  </div>
                </div>
                <div className="property-row">
                  <div className="property-group property-group--half">
                    <label>Prefix</label>
                    <input
                      type="text"
                      value={selectedItem.formatting?.prefix || ''}
                      onChange={(e) => updateFormatting('prefix', e.target.value)}
                      className="property-input"
                    />
                  </div>
                  <div className="property-group property-group--half">
                    <label>Suffix</label>
                    <input
                      type="text"
                      value={selectedItem.formatting?.suffix || ''}
                      onChange={(e) => updateFormatting('suffix', e.target.value)}
                      className="property-input"
                    />
                  </div>
                </div>
                <div className="property-group">
                  <label className="property-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedItem.formatting?.showUnit ?? true}
                      onChange={(e) => updateFormatting('showUnit', e.target.checked)}
                    />
                    <span>Show unit</span>
                  </label>
                </div>
              </div>
            )}
          </>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* STYLE TAB */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'style' && (
          <>
            <div className="property-section">
              <div className="property-section__title">Colors</div>
              <div className="property-group">
                <label>Fill Color</label>
                <div className="property-color-picker">
                  <input
                    type="color"
                    value={selectedItem.style?.fill || '#3b82f6'}
                    onChange={(e) => updateStyle('fill', e.target.value)}
                    className="property-color-input"
                  />
                  <input
                    type="text"
                    value={selectedItem.style?.fill || ''}
                    onChange={(e) => updateStyle('fill', e.target.value)}
                    placeholder="#3b82f6"
                    className="property-input property-input--color"
                  />
                </div>
                <div className="property-color-presets">
                  {COLOR_PRESETS.slice(0, 8).map(color => (
                    <button
                      key={color}
                      className="property-color-preset"
                      style={{ backgroundColor: color }}
                      onClick={() => updateStyle('fill', color)}
                    />
                  ))}
                </div>
              </div>
              
              <div className="property-group">
                <label>Stroke Color</label>
                <div className="property-color-picker">
                  <input
                    type="color"
                    value={selectedItem.style?.stroke || '#ffffff'}
                    onChange={(e) => updateStyle('stroke', e.target.value)}
                    className="property-color-input"
                  />
                  <input
                    type="text"
                    value={selectedItem.style?.stroke || ''}
                    onChange={(e) => updateStyle('stroke', e.target.value)}
                    placeholder="#ffffff"
                    className="property-input property-input--color"
                  />
                </div>
              </div>
              
              <div className="property-group">
                <label>Stroke Width</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={selectedItem.style?.strokeWidth ?? 2}
                  onChange={(e) => updateStyle('strokeWidth', Number(e.target.value))}
                  className="property-input"
                />
              </div>
              
              <div className="property-group">
                <label>Opacity</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={selectedItem.style?.opacity ?? 1}
                  onChange={(e) => updateStyle('opacity', Number(e.target.value))}
                  className="property-slider"
                />
                <span className="property-slider-value">{Math.round((selectedItem.style?.opacity ?? 1) * 100)}%</span>
              </div>
            </div>
            
            <div className="property-section">
              <div className="property-section__title">Text</div>
              <div className="property-group">
                <label>Font Size</label>
                <input
                  type="number"
                  min="8"
                  max="72"
                  value={selectedItem.style?.fontSize ?? 14}
                  onChange={(e) => updateStyle('fontSize', Number(e.target.value))}
                  className="property-input"
                />
              </div>
              <div className="property-group">
                <label>Font Weight</label>
                <select
                  value={selectedItem.style?.fontWeight || 'normal'}
                  onChange={(e) => updateStyle('fontWeight', e.target.value)}
                  className="property-select"
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="lighter">Light</option>
                </select>
              </div>
              <div className="property-group">
                <label>Text Align</label>
                <div className="property-button-group">
                  {(['left', 'center', 'right'] as const).map(align => (
                    <button
                      key={align}
                      className={`property-button ${selectedItem.style?.textAlign === align ? 'active' : ''}`}
                      onClick={() => updateStyle('textAlign', align)}
                    >
                      {align === 'left' ? 'Left' : align === 'center' ? 'Centre' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Phase 8 (C2/C4/C6) — font family, italic, underline, text background. */}
              <div className="property-group">
                <label>Font Family</label>
                <select
                  className="property-select"
                  value={selectedItem.style?.fontFamily || ''}
                  onChange={(e) => updateStyle('fontFamily', e.target.value || undefined)}
                >
                  <option value="">Default</option>
                  <option value="var(--ams-font-sans, sans-serif)">Sans-serif</option>
                  <option value="Georgia, serif">Serif</option>
                  <option value="ui-monospace, monospace">Monospace</option>
                </select>
              </div>
              <div className="property-group">
                <label>Style</label>
                <div className="property-button-group">
                  <button
                    className={`property-button ${selectedItem.style?.fontStyle === 'italic' ? 'active' : ''}`}
                    data-testid="text-italic"
                    onClick={() => updateStyle('fontStyle', selectedItem.style?.fontStyle === 'italic' ? undefined : 'italic')}
                    style={{ fontStyle: 'italic' }}
                  >I</button>
                  <button
                    className={`property-button ${selectedItem.style?.textDecoration === 'underline' ? 'active' : ''}`}
                    data-testid="text-underline"
                    onClick={() => updateStyle('textDecoration', selectedItem.style?.textDecoration === 'underline' ? undefined : 'underline')}
                    style={{ textDecoration: 'underline' }}
                  >U</button>
                </div>
              </div>
              <div className="property-group">
                <label>Text Background</label>
                <input
                  type="text"
                  className="property-input"
                  placeholder="none — e.g. var(--ams-container-bg)"
                  value={selectedItem.style?.background ?? ''}
                  onChange={(e) => updateStyle('background', e.target.value || undefined)}
                />
              </div>
            </div>
            
            <div className="property-section">
              <div className="property-section__title">Border</div>
              <div className="property-group">
                <label>Border Radius</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={selectedItem.style?.borderRadius ?? 0}
                  onChange={(e) => updateStyle('borderRadius', Number(e.target.value))}
                  className="property-input"
                />
              </div>
            </div>
          </>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* LIMITS TAB */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'limits' && hasAlarmLimits && (
          <>
            <div className="property-section">
              <div className="property-section__title">Alarm Limits</div>
              <div className="property-section__hint">
                Configure alarm thresholds for visual indication
              </div>
              
              <div className="property-group">
                <label className="property-label--alarm property-label--hihi">Hi-Hi</label>
                <input
                  type="number"
                  value={selectedItem.alarmLimits?.hiHi ?? ''}
                  onChange={(e) => updateAlarmLimits('hiHi', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Critical high"
                  className="property-input property-input--alarm-hihi"
                />
              </div>
              
              <div className="property-group">
                <label className="property-label--alarm property-label--hi">Hi</label>
                <input
                  type="number"
                  value={selectedItem.alarmLimits?.hi ?? ''}
                  onChange={(e) => updateAlarmLimits('hi', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="High warning"
                  className="property-input property-input--alarm-hi"
                />
              </div>
              
              <div className="property-group">
                <label className="property-label--alarm property-label--lo">Lo</label>
                <input
                  type="number"
                  value={selectedItem.alarmLimits?.lo ?? ''}
                  onChange={(e) => updateAlarmLimits('lo', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Low warning"
                  className="property-input property-input--alarm-lo"
                />
              </div>
              
              <div className="property-group">
                <label className="property-label--alarm property-label--lolo">Lo-Lo</label>
                <input
                  type="number"
                  value={selectedItem.alarmLimits?.loLo ?? ''}
                  onChange={(e) => updateAlarmLimits('loLo', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Critical low"
                  className="property-input property-input--alarm-lolo"
                />
              </div>
              
              <div className="property-group">
                <label>Deadband</label>
                <input
                  type="number"
                  min="0"
                  value={selectedItem.alarmLimits?.deadband ?? ''}
                  onChange={(e) => updateAlarmLimits('deadband', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Hysteresis"
                  className="property-input"
                />
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Quick info footer */}
      <div className="property-inspector__footer">
        <div className="property-inspector__id">
          <span>ID:</span> <code>{selectedItem.id.slice(0, 12)}...</code>
        </div>
      </div>
    </div>
  );
};

export default PropertyInspector;
