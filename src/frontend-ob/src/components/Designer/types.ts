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
  targetDisplayId?: string;          // open another saved display
  targetUrl?: string;                // or an external URL
  assetContext?: string;             // UNS path passed as ?asset= (in-context navigation)
  label?: string;                    // breadcrumb / crumb label for the target
  openMode?: 'replace' | 'new-tab' | 'popup'; // default 'replace'
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
