// OpenBridge catalog types (UI, bars/graphs, instruments, indicators, AR, building blocks)

export interface ObcProps {
  value?: number;
  minValue?: number;
  maxValue?: number;
  checked?: boolean;
  level?: number;
  charging?: boolean;
  variant?: string;
  status?: 'active' | 'inactive' | 'caution' | 'warning' | 'alarm' | 'running';
  alertType?: 'alarm' | 'warning' | 'caution' | 'notice';
  gaugeType?: 'filled' | 'bar' | 'needle';
  progressMode?: 'determinate' | 'indeterminate' | 'progressive-indeterminate';
  horizontal?: boolean;
  hasScale?: boolean;
  showLabels?: boolean;
  state?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  disabled?: boolean;
  count?: number;
}

export const OBC_CATALOG_PREFIX = 'obc.ob.';

export function isObcCatalogType(type: string): boolean {
  return type.startsWith(OBC_CATALOG_PREFIX);
}

export function getObcComponentKey(type: string): string {
  return type.slice(OBC_CATALOG_PREFIX.length);
}

export const DEFAULT_OBC_PROPS: Record<string, ObcProps> = {
  'obc.ob.graph.bar-vertical': { value: 65, minValue: 0, maxValue: 100, hasScale: true, showLabels: true },
  'obc.ob.graph.bar-horizontal': { value: 65, minValue: 0, maxValue: 100, hasScale: true, showLabels: true },
  'obc.ob.graph.progress-bar': { value: 60 },
  'obc.ob.graph.circular-progress': { value: 65, progressMode: 'determinate' },
  'obc.ob.graph.graph-mini': { value: 50, minValue: 0, maxValue: 100 },
  'obc.ob.graph.gauge-trend': { value: 50, minValue: 0, maxValue: 100 },
  'obc.ob.inst.gauge-radial': { value: 65, minValue: 0, maxValue: 100, gaugeType: 'needle' },
  'obc.ob.inst.gauge-vertical': { value: 65, minValue: 0, maxValue: 100 },
  'obc.ob.inst.gauge-horizontal': { value: 65, minValue: 0, maxValue: 100 },
  'obc.ob.inst.instrument-radial': { value: 65, minValue: 0, maxValue: 100, gaugeType: 'needle' },
  'obc.ob.inst.thruster': { value: 50, minValue: -100, maxValue: 100 },
  'obc.ob.inst.main-engine': { value: 75, minValue: 0, maxValue: 100 },
  'obc.ob.inst.compass': { value: 180 },
  'obc.ob.inst.speed-gauge': { value: 12, minValue: 0, maxValue: 25 },
  'obc.ob.inst.rudder': { value: 0, minValue: -35, maxValue: 35 },
  'obc.ob.inst.heading': { value: 270 },
  'obc.ob.inst.depth-actual': { value: 42, minValue: 0, maxValue: 100 },
  'obc.ob.ind.status-indicator': { status: 'active' },
  'obc.ob.ind.battery-icon': { level: 75, charging: false },
  'obc.ob.ind.alert-icon': { alertType: 'caution' },
  'obc.ob.ind.progress-dots': { value: 2 },
  'obc.ob.ui.toggle-switch': { checked: false },
  'obc.ob.ui.slider': { value: 50, minValue: 0, maxValue: 100 },
  'obc.ob.ui.number-input': { value: 0 },
  'obc.ob.bb.alert-list': {},
  'obc.ob.bb.circular-progress': { value: 65, progressMode: 'determinate' },
};

export function getDefaultObcProps(type: string): ObcProps {
  return { ...(DEFAULT_OBC_PROPS[type] ?? { value: 0 }) };
}
