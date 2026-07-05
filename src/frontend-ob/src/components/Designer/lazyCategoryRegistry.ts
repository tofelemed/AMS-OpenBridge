import type { SymbolCategory, SymbolDefinition } from './types';
import type { AutomationRenderContext, CatalogRenderContext } from './obcRenderShared';
import type { ReactNode } from 'react';

/** Palette category IDs — one lazy chunk per category */
export type LazyCategoryId =
  | 'automation-devices'
  | 'automation-config'
  | 'automation-control'
  | 'automation-readouts'
  | 'automation-tanks'
  | 'automation-lines'
  | 'automation-icons'
  | 'automation-sequence'
  | 'obc-ui'
  | 'obc-bars-graphs'
  | 'obc-instruments'
  | 'obc-indicators'
  | 'obc-ar'
  | 'obc-building-blocks';

/** Renderer bundle groups — lazy-loaded on first canvas use per domain */
export type RendererGroupId = 'automation' | 'catalog';

export interface LazyCategoryMeta {
  id: LazyCategoryId;
  name: string;
  icon: string;
}

export const LAZY_CATEGORY_META: LazyCategoryMeta[] = [
  { id: 'automation-devices', name: 'Automation Devices', icon: '⚡' },
  { id: 'automation-config', name: 'Automation Configurations', icon: '⚙' },
  { id: 'automation-control', name: 'Automation Control', icon: '▦' },
  { id: 'automation-readouts', name: 'Readouts', icon: '123' },
  { id: 'automation-tanks', name: 'Tanks', icon: '⛢' },
  { id: 'automation-lines', name: 'Line', icon: '━' },
  { id: 'automation-icons', name: 'Icon', icon: '◈' },
  { id: 'automation-sequence', name: 'Sequence', icon: '▣' },
  { id: 'obc-ui', name: 'UI Components', icon: '▣' },
  { id: 'obc-bars-graphs', name: 'Bars and Graphs', icon: '📊' },
  { id: 'obc-instruments', name: 'Instruments', icon: '🧭' },
  { id: 'obc-indicators', name: 'Indicators', icon: '●' },
  { id: 'obc-ar', name: 'AR', icon: '🗺' },
  { id: 'obc-building-blocks', name: 'Building Blocks', icon: '🧱' },
];

/** Map symbol type → palette category for lazy loading */
const TYPE_TO_CATEGORY: Record<string, LazyCategoryId> = {
  // Automation devices
  'obc.auto.analog-valve': 'automation-devices',
  'obc.auto.automation-button': 'automation-devices',
  'obc.auto.bipolar-transistor': 'automation-devices',
  'obc.auto.capacitor': 'automation-devices',
  'obc.auto.converter': 'automation-devices',
  'obc.auto.damper': 'automation-devices',
  'obc.auto.digital-valve': 'automation-devices',
  'obc.auto.diodes': 'automation-devices',
  'obc.auto.fan': 'automation-devices',
  'obc.auto.filter': 'automation-devices',
  'obc.auto.ground': 'automation-devices',
  'obc.auto.logic': 'automation-devices',
  'obc.auto.mosfet': 'automation-devices',
  'obc.auto.motor': 'automation-devices',
  'obc.auto.pump': 'automation-devices',
  'obc.auto.resistor': 'automation-devices',
  'obc.auto.router': 'automation-devices',
  'obc.auto.source': 'automation-devices',
  'obc.auto.switch': 'automation-devices',
  'obc.auto.transformer': 'automation-devices',
  // Automation config / control / readouts / tanks
  'obc.auto.automation-badge': 'automation-config',
  'obc.auto.automation-input-modal': 'automation-config',
  'obc.auto.readout-stack': 'automation-config',
  'obc.auto.control-compact': 'automation-control',
  'obc.auto.automation-readout': 'automation-readouts',
  'obc.auto.automation-tank': 'automation-tanks',
  'obc.auto.automation-tank-compact': 'automation-tanks',
  // Lines / icons / sequence
  'obc.auto.horizontal-line': 'automation-lines',
  'obc.auto.vertical-line': 'automation-lines',
  'obc.auto.corner-line': 'automation-lines',
  'obc.auto.three-way-line': 'automation-lines',
  'obc.auto.direction-line': 'automation-lines',
  'obc.auto.end-point-line': 'automation-lines',
  'obc.auto.line-cross': 'automation-lines',
  'obc.auto.line-overlap': 'automation-lines',
  'obc.auto.valve-three-way-icon': 'automation-icons',
  'obc.auto.valve-two-way-icon': 'automation-icons',
  'obc.auto.sequence-connector': 'automation-sequence',
  'obc.auto.sequence-item': 'automation-sequence',
  'obc.auto.sequence-step': 'automation-sequence',
  'obc.auto.sequence-toolbar': 'automation-sequence',
  'obc.auto.sequence-card': 'automation-sequence',
};

/** Category → renderer bundle */
const CATEGORY_TO_RENDERER: Record<LazyCategoryId, RendererGroupId> = {
  'automation-devices': 'automation',
  'automation-config': 'automation',
  'automation-control': 'automation',
  'automation-readouts': 'automation',
  'automation-tanks': 'automation',
  'automation-lines': 'automation',
  'automation-icons': 'automation',
  'automation-sequence': 'automation',
  'obc-ui': 'catalog',
  'obc-bars-graphs': 'catalog',
  'obc-instruments': 'catalog',
  'obc-indicators': 'catalog',
  'obc-ar': 'catalog',
  'obc-building-blocks': 'catalog',
};

// Register obc.ob.* types → category from prefix
function registerCatalogTypes(prefix: string, category: LazyCategoryId, ids: string[]) {
  for (const id of ids) TYPE_TO_CATEGORY[`obc.ob.${prefix}.${id}`] = category;
}

registerCatalogTypes('ui', 'obc-ui', [
  'button', 'icon-button', 'check-button', 'command-button', 'rich-button', 'toggle-switch',
  'start-stop-switch', 'slider', 'slider-double', 'number-input', 'text-input', 'textarea',
  'dropdown-button', 'split-button', 'menu-button', 'card', 'elevated-card', 'tabbed-card',
  'accordion-card', 'divider', 'navigation-item', 'breadcrumb', 'table', 'pagination',
  'modal-window', 'tooltip', 'alert-button', 'form-container', 'radio', 'checkbox', 'tag',
  'filter-chip', 'progress-button', 'clock', 'badge', 'notification-button', 'keyboard-numeric',
  'stepper-box', 'title-container', 'event-list', 'advice-button', 'system-button', 'vendor-button',
]);
registerCatalogTypes('graph', 'obc-bars-graphs', [
  'bar-vertical', 'bar-horizontal', 'progress-bar', 'circular-progress', 'graph-mini', 'gauge-trend',
]);
registerCatalogTypes('inst', 'obc-instruments', [
  'gauge-radial', 'gauge-vertical', 'gauge-horizontal', 'instrument-radial', 'thruster',
  'azimuth-thruster', 'main-engine', 'compass', 'compass-flat', 'compass-indicator', 'speed-gauge',
  'speed-indicator', 'speed-arrows', 'rudder', 'rot-indicator', 'heading', 'wind', 'wind-indicator',
  'pitch', 'roll', 'pitch-roll', 'depth-actual', 'heave', 'rate-of-turn', 'instrument-field',
  'bearing-indicator', 'watch', 'watch-flat', 'velocity-projection-plot',
]);
registerCatalogTypes('ind', 'obc-indicators', [
  'status-indicator', 'battery-icon', 'progress-dots', 'alert-icon', 'alert-frame', 'badge-command',
]);
registerCatalogTypes('ar', 'obc-ar', [
  'poi-vessel', 'poi-aton', 'poi-data', 'poi-card', 'poi-card-header', 'poi-controller',
  'poi-group', 'poi-layer', 'poi-layer-stack', 'poi-button-vessel', 'poi-button-aton',
  'poi-button-data', 'poi-object-vessel', 'poi-object-aton', 'poi-object-data',
  'chart-object-vessel-button',
]);
registerCatalogTypes('bb', 'obc-building-blocks', [
  'alert-list', 'bar-vertical', 'bar-horizontal', 'circular-progress', 'instrument-radial',
]);

export function resolveCategoryId(symbolType: string): LazyCategoryId | null {
  if (TYPE_TO_CATEGORY[symbolType]) return TYPE_TO_CATEGORY[symbolType];
  if (symbolType.startsWith('obc.auto.')) return 'automation-devices';
  if (symbolType.startsWith('obc.ob.')) return 'obc-ui';
  return null;
}

export function resolveRendererGroup(symbolType: string): RendererGroupId | null {
  const cat = resolveCategoryId(symbolType);
  return cat ? CATEGORY_TO_RENDERER[cat] : null;
}

export function isLazyObcType(symbolType: string): boolean {
  return symbolType.startsWith('obc.auto.') || symbolType.startsWith('obc.ob.');
}

type LibraryModule = { default: SymbolCategory };
type AutomationRenderer = (ctx: AutomationRenderContext) => ReactNode;
type CatalogRenderer = (ctx: CatalogRenderContext) => ReactNode;

const AUTOMATION_CATEGORY_INDEX: Record<string, number> = {
  'automation-devices': 0, 'automation-config': 1, 'automation-control': 2,
  'automation-readouts': 3, 'automation-tanks': 4, 'automation-lines': 5,
  'automation-icons': 6, 'automation-sequence': 7,
};
const CATALOG_CATEGORY_INDEX: Record<string, number> = {
  'obc-ui': 0, 'obc-bars-graphs': 1, 'obc-instruments': 2,
  'obc-indicators': 3, 'obc-ar': 4, 'obc-building-blocks': 5,
};

let automationLibraryPromise: Promise<typeof import('./openBridgeAutomationLibrary')> | null = null;
let catalogLibraryPromise: Promise<typeof import('./openBridgeCatalogLibrary')> | null = null;

function loadAutomationLibraryModule() {
  if (!automationLibraryPromise) {
    automationLibraryPromise = import('./openBridgeAutomationLibrary');
  }
  return automationLibraryPromise;
}

function loadCatalogLibraryModule() {
  if (!catalogLibraryPromise) {
    catalogLibraryPromise = import('./openBridgeCatalogLibrary');
  }
  return catalogLibraryPromise;
}

const LIBRARY_LOADERS: Record<LazyCategoryId, () => Promise<LibraryModule>> = {
  'automation-devices': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-devices']] }),
  'automation-config': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-config']] }),
  'automation-control': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-control']] }),
  'automation-readouts': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-readouts']] }),
  'automation-tanks': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-tanks']] }),
  'automation-lines': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-lines']] }),
  'automation-icons': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-icons']] }),
  'automation-sequence': async () => ({ default: (await loadAutomationLibraryModule()).OPENBRIDGE_AUTOMATION_LIBRARY[AUTOMATION_CATEGORY_INDEX['automation-sequence']] }),
  'obc-ui': async () => ({ default: (await loadCatalogLibraryModule()).OPENBRIDGE_CATALOG_LIBRARY[CATALOG_CATEGORY_INDEX['obc-ui']] }),
  'obc-bars-graphs': async () => ({ default: (await loadCatalogLibraryModule()).OPENBRIDGE_CATALOG_LIBRARY[CATALOG_CATEGORY_INDEX['obc-bars-graphs']] }),
  'obc-instruments': async () => ({ default: (await loadCatalogLibraryModule()).OPENBRIDGE_CATALOG_LIBRARY[CATALOG_CATEGORY_INDEX['obc-instruments']] }),
  'obc-indicators': async () => ({ default: (await loadCatalogLibraryModule()).OPENBRIDGE_CATALOG_LIBRARY[CATALOG_CATEGORY_INDEX['obc-indicators']] }),
  'obc-ar': async () => ({ default: (await loadCatalogLibraryModule()).OPENBRIDGE_CATALOG_LIBRARY[CATALOG_CATEGORY_INDEX['obc-ar']] }),
  'obc-building-blocks': async () => ({ default: (await loadCatalogLibraryModule()).OPENBRIDGE_CATALOG_LIBRARY[CATALOG_CATEGORY_INDEX['obc-building-blocks']] }),
};

const RENDERER_LOADERS: Record<RendererGroupId, () => Promise<{ renderSymbol: AutomationRenderer | CatalogRenderer }>> = {
  automation: () => import('./renderers/automationRenderer'),
  catalog: () => import('./renderers/catalogRenderer'),
};

const libraryCache = new Map<LazyCategoryId, SymbolCategory>();
const libraryPromises = new Map<LazyCategoryId, Promise<SymbolCategory>>();
const rendererCache = new Map<RendererGroupId, AutomationRenderer | CatalogRenderer>();
const rendererPromises = new Map<RendererGroupId, Promise<AutomationRenderer | CatalogRenderer>>();

export function loadCategoryLibrary(categoryId: LazyCategoryId): Promise<SymbolCategory> {
  const cached = libraryCache.get(categoryId);
  if (cached) return Promise.resolve(cached);

  let promise = libraryPromises.get(categoryId);
  if (!promise) {
    promise = LIBRARY_LOADERS[categoryId]().then(mod => {
      libraryCache.set(categoryId, mod.default);
      return mod.default;
    });
    libraryPromises.set(categoryId, promise);
  }
  return promise;
}

export function loadRendererForType(symbolType: string): Promise<AutomationRenderer | CatalogRenderer | null> {
  const group = resolveRendererGroup(symbolType);
  if (!group) return Promise.resolve(null);

  const cached = rendererCache.get(group);
  if (cached) return Promise.resolve(cached);

  let promise = rendererPromises.get(group);
  if (!promise) {
    promise = RENDERER_LOADERS[group]().then(mod => {
      rendererCache.set(group, mod.renderSymbol);
      return mod.renderSymbol;
    });
    rendererPromises.set(group, promise);
  }
  return promise;
}

/** Preload library + renderer when a palette category is expanded */
export function preloadCategory(categoryId: LazyCategoryId): void {
  void loadCategoryLibrary(categoryId);
  const group = CATEGORY_TO_RENDERER[categoryId];
  void loadRendererForType(group === 'automation' ? 'obc.auto.pump' : 'obc.ob.ui.button');
}

/** Preload all renderer groups needed by symbols on the canvas */
export function preloadForSymbolTypes(types: string[]): void {
  const groups = new Set<RendererGroupId>();
  const categories = new Set<LazyCategoryId>();
  for (const type of types) {
    const cat = resolveCategoryId(type);
    if (cat) categories.add(cat);
    const group = resolveRendererGroup(type);
    if (group) groups.add(group);
  }
  categories.forEach(c => void loadCategoryLibrary(c));
  groups.forEach(g => {
    const sample = g === 'automation' ? 'obc.auto.pump' : 'obc.ob.ui.button';
    void loadRendererForType(sample);
  });
}

export function getCachedCategory(categoryId: LazyCategoryId): SymbolCategory | undefined {
  return libraryCache.get(categoryId);
}

export function findCachedSymbol(symbolType: string): SymbolDefinition | null {
  const catId = resolveCategoryId(symbolType);
  if (!catId) return null;
  const cat = libraryCache.get(catId);
  return cat?.symbols.find(s => s.type === symbolType) ?? null;
}
