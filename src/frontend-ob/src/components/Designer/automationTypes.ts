// OpenBridge Automation component property types (mirrors @oicl/openbridge-webcomponents)

export type LineMedium = 'normal' | 'empty' | 'water' | 'air';
export type LineType = 'fluid' | 'electric' | 'air' | 'connector';

export interface AutomationProps {
  // Motorized devices (pump, motor, fan, …)
  on?: boolean;
  vertical?: boolean;
  speedInPercent?: number;
  labelDirection?: 'up' | 'down' | 'left' | 'right';
  variant?: string;

  // Valves & analog icons
  open?: boolean;
  value?: number;
  value2?: number;
  closed?: boolean;
  horizontal?: boolean;

  // Lines
  medium?: LineMedium;
  lineType?: LineType;
  length?: number;
  direction?: string;

  // Tank
  max?: number;
  trend?: 'fast-rising' | 'rising' | 'stable' | 'falling' | 'fast-falling';
  tankVariant?: 'vertical' | 'compact';
  tag?: string;

  // Readout
  numberOfDigits?: number;
  readoutPosition?: 'left' | 'right' | 'top' | 'bottom';

  // Automation button / control
  state?: 'open' | 'closed';
  showReadoutStack?: boolean;
  buttonReadoutPosition?: 'top' | 'bottom' | 'left' | 'right';
  buttonDirection?: string;
  alert?: boolean;
  static?: boolean;

  // Badge
  badgeMode?: 'flat' | 'regular' | 'enhanced';
  badgeType?: 'auto' | 'command-locked' | 'duty' | 'alert-off';

  // Resistor icon variant
  alternativeIcon?: string;

  // Sequence
  sequenceType?: 'small' | 'medium' | 'large';
  sequenceValue?: 'not-started' | 'loading' | 'regular' | 'next' | 'active' | 'completed';
  sequenceOrientation?: 'vertical' | 'horizontal';
  sequenceStyle?: 'regular' | 'point' | 'connector';
  toolbarType?: 'unordered' | 'condensed' | 'sequential';
  connectorState?: 'not-started' | 'loading' | 'completed' | 'steps-between';
  loadingBarPercent?: number;
  hasAdd?: boolean;
  title?: string;
  subtitle?: string;
  stepLabel?: string;
  cardTitle?: string;
}

export const AUTOMATION_TYPE_PREFIX = 'obc.auto.';

export function isAutomationType(type: string): boolean {
  return type.startsWith(AUTOMATION_TYPE_PREFIX);
}

export const DEFAULT_AUTOMATION_PROPS: Record<string, AutomationProps> = {
  'obc.auto.analog-valve': { open: false, value: 50, vertical: false, variant: 'regular' },
  'obc.auto.digital-valve': { open: false, vertical: false, variant: 'regular' },
  'obc.auto.pump': { on: false, vertical: false, speedInPercent: 100, showReadoutStack: true },
  'obc.auto.motor': { on: false, speedInPercent: 100, showReadoutStack: true, variant: 'regular' },
  'obc.auto.fan': { on: false, speedInPercent: 100, showReadoutStack: true },
  'obc.auto.damper': { on: false, variant: 'square' },
  'obc.auto.automation-button': { state: 'closed', showReadoutStack: true, variant: 'regular' },
  'obc.auto.automation-readout': { value: 0, numberOfDigits: 3, readoutPosition: 'right', lineType: 'fluid' },
  'obc.auto.automation-tank': { value: 65, max: 100, medium: 'water', trend: 'stable', tankVariant: 'vertical', tag: 'TK-101' },
  'obc.auto.horizontal-line': { medium: 'water', lineType: 'fluid', length: 100 },
  'obc.auto.vertical-line': { medium: 'water', lineType: 'fluid', length: 100 },
  'obc.auto.corner-line': { medium: 'water', lineType: 'fluid', direction: 'top-right' },
  'obc.auto.three-way-line': { medium: 'water', lineType: 'fluid', direction: 'top' },
  'obc.auto.direction-line': { medium: 'water', lineType: 'fluid' },
  'obc.auto.end-point-line': { medium: 'water', lineType: 'fluid' },
  'obc.auto.line-cross': { medium: 'water', lineType: 'fluid' },
  'obc.auto.line-overlap': { medium: 'water', lineType: 'fluid' },
  'obc.auto.valve-three-way-icon': { value: 50, value2: 50, closed: false, horizontal: false },
  'obc.auto.valve-two-way-icon': { value: 50, closed: false, vertical: false },
  'obc.auto.sequence-step': { sequenceType: 'medium', sequenceValue: 'regular', sequenceOrientation: 'horizontal', sequenceStyle: 'regular', stepLabel: '1' },
  'obc.auto.sequence-connector': { sequenceType: 'medium', connectorState: 'completed', sequenceOrientation: 'horizontal', loadingBarPercent: 50 },
  'obc.auto.sequence-item': { title: 'Step', subtitle: 'Description', sequenceValue: 'active', stepLabel: '1' },
  'obc.auto.sequence-toolbar': { toolbarType: 'sequential', hasAdd: false },
  'obc.auto.sequence-card': { cardTitle: 'Event', subtitle: 'Details', sequenceValue: 'active' },
  'obc.auto.automation-badge': { badgeMode: 'regular', badgeType: 'auto' },
};

export function getDefaultAutomationProps(type: string): AutomationProps {
  return { ...(DEFAULT_AUTOMATION_PROPS[type] ?? { on: false }) };
}
