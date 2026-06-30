// ═══════════════════════════════════════════════════════════════════════════
// HMI Designer Types
// ═══════════════════════════════════════════════════════════════════════════

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
  // Equipment-specific
  alarmLimits?: AlarmLimits;
  // Shape-specific
  shapeProps?: ShapeProps;
  // Text-specific
  textProps?: TextProps;
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
