import type { SymbolCategory, SymbolDefinition } from './types';

const obc = (sym: Omit<SymbolDefinition, 'isOpenBridge'>): SymbolDefinition => ({
  ...sym,
  isOpenBridge: true,
});

const device = (
  id: string,
  label: string,
  icon: string,
  bindingSlots: string[],
  defaultSize = { width: 80, height: 82 },
  description?: string
): SymbolDefinition =>
  obc({
    type: `obc.auto.${id}`,
    label,
    icon,
    category: 'automation-devices',
    defaultSize,
    bindingSlots,
    description: description ?? `OpenBridge ${label} (ISA automation symbol)`,
  });

/** OpenBridge AUTOMATION categories — matches Storybook tree */
export const OPENBRIDGE_AUTOMATION_LIBRARY: SymbolCategory[] = [
  {
    id: 'automation-devices',
    name: 'Automation Devices',
    icon: '⚡',
    symbols: [
      device('analog-valve', 'Analog Valve', 'AV', ['status', 'position'], { width: 66, height: 82 }),
      device('automation-button', 'Automation Button', 'AB', ['command', 'status'], { width: 66, height: 82 }),
      device('bipolar-transistor', 'Bipolar Transistor', 'Q', ['status'], { width: 66, height: 66 }),
      device('capacitor', 'Capacitor', 'C', ['status'], { width: 66, height: 66 }),
      device('converter', 'Converter', 'CV', ['status'], { width: 66, height: 66 }),
      device('damper', 'Damper', 'DM', ['status'], { width: 66, height: 66 }),
      device('digital-valve', 'Digital Valve', 'DV', ['status'], { width: 66, height: 82 }),
      device('diodes', 'Diodes', 'D', ['status'], { width: 66, height: 66 }),
      device('fan', 'Fan', 'FN', ['status', 'speed'], { width: 66, height: 82 }),
      device('filter', 'Filter', 'FL', ['status'], { width: 66, height: 66 }),
      device('ground', 'Ground', 'GND', [], { width: 40, height: 40 }),
      device('logic', 'Logic', 'LG', ['status'], { width: 66, height: 66 }),
      device('mosfet', 'Mosfet', 'M', ['status'], { width: 66, height: 66 }),
      device('motor', 'Motor', 'MTR', ['status', 'speed'], { width: 66, height: 82 }),
      device('pump', 'Pump', 'P', ['status', 'speed'], { width: 66, height: 82 }),
      device('resistor', 'Resistor', 'R', ['status'], { width: 66, height: 66 }),
      device('router', 'Router', 'RT', ['status'], { width: 66, height: 66 }),
      device('source', 'Source', 'SRC', ['status'], { width: 66, height: 66 }),
      device('switch', 'Switch', 'SW', ['status'], { width: 66, height: 66 }),
      device('transformer', 'Transformer', 'XF', ['status'], { width: 66, height: 66 }),
    ],
  },
  {
    id: 'automation-config',
    name: 'Automation Configurations',
    icon: '⚙',
    symbols: [
      obc({
        type: 'obc.auto.automation-badge',
        label: 'Automation Badge',
        icon: 'BDG',
        category: 'automation-config',
        defaultSize: { width: 32, height: 32 },
        bindingSlots: [],
        description: 'Auto / duty / command-locked badge overlay',
      }),
      obc({
        type: 'obc.auto.automation-input-modal',
        label: 'Input Modal',
        icon: 'IN',
        category: 'automation-config',
        defaultSize: { width: 200, height: 120 },
        bindingSlots: ['value'],
        description: 'Automation numeric input modal',
      }),
      obc({
        type: 'obc.auto.readout-stack',
        label: 'Readout Stack',
        icon: 'RS',
        category: 'automation-config',
        defaultSize: { width: 120, height: 80 },
        bindingSlots: ['value'],
        description: 'Automation button readout stack',
      }),
    ],
  },
  {
    id: 'automation-control',
    name: 'Automation Control',
    icon: '▦',
    symbols: [
      obc({
        type: 'obc.auto.control-compact',
        label: 'Control (Compact)',
        icon: 'CTL',
        category: 'automation-control',
        defaultSize: { width: 66, height: 66 },
        bindingSlots: ['command', 'status'],
        description: 'Compact automation control button',
      }),
    ],
  },
  {
    id: 'automation-readouts',
    name: 'Readouts',
    icon: '123',
    symbols: [
      obc({
        type: 'obc.auto.automation-readout',
        label: 'Automation Readout',
        icon: '#',
        category: 'automation-readouts',
        defaultSize: { width: 120, height: 40 },
        bindingSlots: ['value'],
        description: 'OpenBridge automation readout with unit',
      }),
    ],
  },
  {
    id: 'automation-tanks',
    name: 'Tanks',
    icon: '⛢',
    symbols: [
      obc({
        type: 'obc.auto.automation-tank',
        label: 'Tank',
        icon: 'TK',
        category: 'automation-tanks',
        defaultSize: { width: 168, height: 173 },
        bindingSlots: ['level'],
        hasAlarmLimits: true,
        description: 'Vertical tank with level, trend, and tag',
      }),
      obc({
        type: 'obc.auto.automation-tank-compact',
        label: 'Tank (Compact)',
        icon: 'Tk',
        category: 'automation-tanks',
        defaultSize: { width: 120, height: 100 },
        bindingSlots: ['level'],
        hasAlarmLimits: true,
        description: 'Compact tank variant',
      }),
    ],
  },
  {
    id: 'automation-lines',
    name: 'Line',
    icon: '━',
    symbols: [
      obc({ type: 'obc.auto.horizontal-line', label: 'Horizontal Line', icon: '─', category: 'automation-lines', defaultSize: { width: 120, height: 12 }, bindingSlots: [], description: 'Horizontal process line' }),
      obc({ type: 'obc.auto.vertical-line', label: 'Vertical Line', icon: '│', category: 'automation-lines', defaultSize: { width: 12, height: 120 }, bindingSlots: [], description: 'Vertical process line' }),
      obc({ type: 'obc.auto.corner-line', label: 'Corner Line', icon: '┐', category: 'automation-lines', defaultSize: { width: 40, height: 40 }, bindingSlots: [], description: '90° corner connection' }),
      obc({ type: 'obc.auto.three-way-line', label: 'Three-Way Line', icon: '┬', category: 'automation-lines', defaultSize: { width: 40, height: 40 }, bindingSlots: [], description: 'T-junction line' }),
      obc({ type: 'obc.auto.direction-line', label: 'Direction Line', icon: '→', category: 'automation-lines', defaultSize: { width: 40, height: 40 }, bindingSlots: [], description: 'Flow direction indicator' }),
      obc({ type: 'obc.auto.end-point-line', label: 'End Point Line', icon: '•', category: 'automation-lines', defaultSize: { width: 24, height: 24 }, bindingSlots: [], description: 'Line end cap' }),
      obc({ type: 'obc.auto.line-cross', label: 'Line Cross', icon: '┼', category: 'automation-lines', defaultSize: { width: 40, height: 40 }, bindingSlots: [], description: 'Crossing lines' }),
      obc({ type: 'obc.auto.line-overlap', label: 'Line Overlap', icon: '⊞', category: 'automation-lines', defaultSize: { width: 40, height: 40 }, bindingSlots: [], description: 'Overlapping line segment' }),
    ],
  },
  {
    id: 'automation-icons',
    name: 'Icon',
    icon: '◈',
    symbols: [
      obc({
        type: 'obc.auto.valve-three-way-icon',
        label: 'Valve Analog Three Way',
        icon: '3V',
        category: 'automation-icons',
        defaultSize: { width: 80, height: 80 },
        bindingSlots: ['position', 'position2'],
        description: 'Three-way analog valve icon (open/closed/half-open states)',
      }),
      obc({
        type: 'obc.auto.valve-two-way-icon',
        label: 'Valve Analog Two Way',
        icon: '2V',
        category: 'automation-icons',
        defaultSize: { width: 80, height: 80 },
        bindingSlots: ['position'],
        description: 'Two-way analog valve icon',
      }),
    ],
  },
  {
    id: 'automation-sequence',
    name: 'Sequence',
    icon: '▣',
    symbols: [
      obc({ type: 'obc.auto.sequence-connector', label: 'Sequence Connector', icon: '─', category: 'automation-sequence', defaultSize: { width: 80, height: 12 }, bindingSlots: [], description: 'Step connector line' }),
      obc({ type: 'obc.auto.sequence-item', label: 'Sequence Item', icon: 'SI', category: 'automation-sequence', defaultSize: { width: 200, height: 60 }, bindingSlots: [], description: 'Sequence step with title and subtitle' }),
      obc({ type: 'obc.auto.sequence-step', label: 'Sequence Step', icon: '①', category: 'automation-sequence', defaultSize: { width: 40, height: 40 }, bindingSlots: [], description: 'Sequence step indicator' }),
      obc({ type: 'obc.auto.sequence-toolbar', label: 'Sequence Toolbar', icon: 'TB', category: 'automation-sequence', defaultSize: { width: 320, height: 48 }, bindingSlots: [], description: 'Sequence navigation toolbar' }),
      obc({ type: 'obc.auto.sequence-card', label: 'Sequence Card', icon: 'SC', category: 'automation-sequence', defaultSize: { width: 280, height: 120 }, bindingSlots: [], description: 'Timeline sequence card' }),
    ],
  },
];

export const AUTOMATION_SYMBOL_TYPES = new Set(
  OPENBRIDGE_AUTOMATION_LIBRARY.flatMap(cat => cat.symbols.map(s => s.type))
);

export { resolveAutomationRenderType } from './obcRenderShared';
