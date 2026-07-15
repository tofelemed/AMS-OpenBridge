// ═══════════════════════════════════════════════════════════════════════════
// HMI Designer Types
// ═══════════════════════════════════════════════════════════════════════════

import type { AutomationProps } from './automationTypes';
import type { ObcProps } from './obcCatalogTypes';

export interface CanvasItem {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  bindings?: Record<string, string>;
  label?: string;
  formatting?: FormattingOptions;
  style?: ItemStyle;
  rotation?: number;
  zIndex?: number;
  locked?: boolean;
  hidden?: boolean;        // Phase G — layer visibility toggle
  flipH?: boolean;         // Phase G — horizontal flip
  flipV?: boolean;         // Phase G — vertical flip
  groupId?: string;        // Phase G — grouping (selecting one selects the group)
  // Equipment-specific
  alarmLimits?: AlarmLimits;
  // Shape-specific
  shapeProps?: ShapeProps;
  // Text-specific
  textProps?: TextProps;
  // OpenBridge automation-specific
  automationProps?: AutomationProps;
  obcProps?: ObcProps;
  // Navigation (Phase D) — click this symbol to open another display / URL / faceplate.
  navigationLink?: NavigationLink;
  // Phase F — alarms & dynamic behavior:
  alarmSource?: string;              // alarm sourceName to bind this symbol to alarmStore
  rules?: VisualRule[];              // conditional formatting (value/limit → color/blink/visibility/rotation)
  multiStateConfig?: MultiStateConfig; // config-driven multi-state (value range → color/label)
  // Phase 2 — per-symbol time context (K17 / E1.23). 'display' (default) follows the display time
  // bar; 'own' lets the symbol keep its own independent range controls.
  timeMode?: 'display' | 'own';
  // Phase 3 — image symbol: id of an uploaded media asset (C19/C21). The id is stored, never the
  // bytes (config-only); the URL is built at render from the media endpoint.
  mediaId?: string;
  // Phase 4 — collections (§I). Present on a 'collection.container' item: repeats its template cell
  // once per matching asset, substituting {{element}} in each cell's bindings.
  collectionConfig?: CollectionConfig;
  // Phase 4 — dynamic search criteria (§J / E5). One asset query drives rows/bars:
  //  · asset-comparison table (table.compare): one row per asset, one column per attribute
  //  · bar chart with criteria set: one bar per asset using attributes[0]
  comparison?: { criteria: CollectionCriteria; attributes: string[] };
  // Phase 4 — table summary columns (E4.5–E4.7): aggregates over the display time range.
  summaryColumns?: Array<'min' | 'max' | 'avg'>;
  // ── Phase 6 — data fidelity ──────────────────────────────────────────────────
  // Per-item display unit (P2/P3/E3.6). Values convert from the tag's native (asset-catalog) unit to
  // this one via utils/uom. Empty/undefined = use the tag's native unit as-is.
  uom?: string;
  // Render the ISA-18.2 / NE107 quality badge from LiveMetric.quality (W4). Defaults on for readouts.
  showQuality?: boolean;
  // Inherit lo/hi engineering limits from the bound asset into alarmLimits (G20/E3.1). The author may
  // recolour but the thresholds come from the asset — set false to use hand-entered alarmLimits.
  inheritLimits?: boolean;
  // Value symbol: show the sample timestamp (E2.4) and map a discrete value → label/colour (E2.7).
  showTimestamp?: boolean;
  stateMap?: StateMapEntry[];
  // Trend: per-pen style keyed by pen path (E1.2–E1.4), manual Y scale (E1.8/E1.10), stepped plot (E1.22).
  trace?: Record<string, TrendTrace>;
  trendScale?: TrendScale;
  steppedLines?: boolean;
}

// ── Phase 6 supporting types ────────────────────────────────────────────────
/** Value symbol digital/string state mapping: a discrete reading → a label (and optional colour). */
export interface StateMapEntry { when: number | string | boolean; label: string; color?: string; }

/** Per-trace trend styling (PI Vision per-trace config). */
export interface TrendTrace {
  color?: string;
  width?: number;
  style?: 'solid' | 'dashed' | 'dotted';
  showMarkers?: boolean;
  hidden?: boolean;   // clickable-legend hide/show (E1.17)
}

/** Trend Y-axis manual scale. auto (default) = ECharts autoscale. */
export interface TrendScale { auto?: boolean; min?: number; max?: number; }

// ── Phase 4: collections ─────────────────────────────────────────────────────
export interface CollectionCriteria {
  root?: string;                 // scope the asset query to this subtree (contextual path)
  returnAllDescendants?: boolean; // whole subtree vs. direct children
  assetType?: number;            // hierarchy level 1–5
  template?: string;             // asset type/template name (e.g. "Tank")
}

export interface CollectionConfig {
  criteria: CollectionCriteria;
  cell: { width: number; height: number }; // one repeating cell footprint
  columns: number;
  gap: number;
  items: CanvasItem[];           // the template cell — positions are relative to the cell origin
  maxInstances?: number;         // paging guard
  sort?: { by: 'name' | 'path'; dir: 'asc' | 'desc' }; // structural sort (I15)
}

// ── Phase F: conditional-formatting rule engine ─────────────────────────────
export type RuleOperator = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between' | 'outside';
export type RuleEffect = 'color' | 'blink' | 'hidden' | 'rotate';

export interface VisualRule {
  slot?: string;        // binding slot whose live value is tested (default = primary value)
  op: RuleOperator;
  value: number | string | boolean;   // threshold (or low bound for between/outside)
  value2?: number;      // high bound for between/outside
  effect: RuleEffect;
  color?: string;       // CSS color / OpenBridge token var() for effect 'color'
  rotateDeg?: number;   // degrees for effect 'rotate'
}

export interface MultiStateItem {
  min?: number;                        // numeric range (inclusive) …
  max?: number;
  equals?: string | number | boolean;  // … or exact match
  label?: string;
  color: string;                       // OpenBridge token var() or CSS color
  blink?: boolean;
}

export interface MultiStateConfig {
  slot?: string;                       // binding slot to evaluate (default 'status'/primary)
  states: MultiStateItem[];
  default?: { label?: string; color?: string };
}

export interface NavigationLink {
  // We store a real FK, not a URL. PI Vision stores the route ("./#/Displays/189/101---Crusher-Detail"),
  // which means renaming a display breaks every inbound link — we resolve the route at render instead.
  targetDisplayId?: string;          // open another saved display
  targetUrl?: string;                // or an external URL (https / same-origin only — validated on author)
  label?: string;                    // breadcrumb / crumb label for the target
  openMode?: 'replace' | 'new-tab' | 'popup'; // default 'replace'

  /**
   * How the clicked symbol's asset reaches the target display (PI Vision's `IncludeAsset`):
   *  'none'                  — no context.
   *  'current-asset'         — pass THIS symbol's own bound asset. A pump tile on an overview opens the
   *                            pump detail *for that pump*. The everyday case.
   *  'current-asset-as-root' — pass it as a root; the target resolves that asset AND its children
   *                            (turbine → turbine + gearbox + generator).
   *  'explicit'              — a fixed asset chosen at author time. The only option for a static shape
   *                            (rectangle/text/hotspot) that has no binding of its own — this is exactly
   *                            PI Vision's "drag an asset onto the symbol" drop field.
   */
  assetContextMode?: 'none' | 'current-asset' | 'current-asset-as-root' | 'explicit';
  assetContext?: string;             // the UNS path — only meaningful when mode === 'explicit'
  includeTimeRange?: boolean;        // target inherits the source display's time range (PI Vision parity)
}

export interface FormattingOptions {
  decimals?: number;
  unit?: string;
  prefix?: string;
  suffix?: string;
  showUnit?: boolean;
  showLabel?: boolean;
  valueColor?: string;
  backgroundColor?: string;
}

export interface AlarmLimits {
  hiHi?: number;
  hi?: number;
  lo?: number;
  loLo?: number;
  deadband?: number;
}

export interface ItemStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** SVG stroke-dasharray, e.g. '6 4' (dashed) or '2 4' (dotted). Undefined = solid. */
  strokeDasharray?: string;
  opacity?: number;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  borderRadius?: number;
}

export interface ShapeProps {
  points?: { x: number; y: number }[];
  cornerRadius?: number;
  startAngle?: number;
  endAngle?: number;
}

export interface TextProps {
  text?: string;
  multiline?: boolean;
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface Asset {
  id: string;
  contextualPath: string;
  name: string;
  type: number; // 1=Site, 2=Area, 3=Unit, 4=Device, 5=Measurement
  description?: string;
  engineeringUnit?: string;
  loEngLimit?: number;
  hiEngLimit?: number;
  parentId?: string;
  children?: Asset[];
}

export interface SymbolDefinition {
  type: string;
  label: string;
  icon: string;
  category: string;
  defaultSize: { width: number; height: number };
  bindingSlots: string[];
  hasAlarmLimits?: boolean;
  description?: string;
  /** true = @oicl/openbridge-webcomponents; false = custom SVG with OpenBridge styling */
  isOpenBridge?: boolean;
}

export interface SymbolCategory {
  id: string;
  name: string;
  icon: string;
  symbols: SymbolDefinition[];
}

// Asset type constants
export const ASSET_TYPES = {
  SITE: 1,
  AREA: 2,
  UNIT: 3,
  DEVICE: 4,
  MEASUREMENT: 5,
} as const;

export const ASSET_TYPE_LABELS: Record<number, string> = {
  1: 'Site',
  2: 'Area',
  3: 'Unit',
  4: 'Device',
  5: 'Measurement',
};

export const ASSET_TYPE_ICONS: Record<number, string> = {
  1: '🏭',
  2: '📍',
  3: '⚙️',
  4: '🔧',
  5: '📊',
};
