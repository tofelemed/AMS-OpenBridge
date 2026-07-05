import React, { useState, useCallback, useMemo } from 'react';
import type { SymbolCategory, SymbolDefinition } from './types';
import {
  LAZY_CATEGORY_META,
  preloadCategory,
  type LazyCategoryId,
} from './lazyCategoryRegistry';
import {
  ensureCategoryLoaded,
  registerStaticCategories,
} from './symbolLibraryService';
interface SymbolPaletteProps {
  onAddItem: (type: string, position: { x: number; y: number }) => void;
}

// Helper: mark OpenBridge vs custom components
const obc = (sym: Omit<SymbolDefinition, 'isOpenBridge'>): SymbolDefinition => ({ ...sym, isOpenBridge: true });
const custom = (sym: Omit<SymbolDefinition, 'isOpenBridge'>): SymbolDefinition => ({ ...sym, isOpenBridge: false });

const STATIC_SYMBOL_LIBRARY: SymbolCategory[] = [
  {
    id: 'indicators',    name: 'Indicators',
    icon: '📊',
    symbols: [
      obc({ type: 'obc.readout', label: 'Numeric Readout', icon: '🔢', category: 'indicators', defaultSize: { width: 120, height: 60 }, bindingSlots: ['value'], description: 'OpenBridge numeric display' }),
      obc({ type: 'obc.readout-unit', label: 'Readout + Unit', icon: '📐', category: 'indicators', defaultSize: { width: 140, height: 70 }, bindingSlots: ['value'], description: 'Numeric with engineering unit' }),
      obc({ type: 'obc.status', label: 'Status Indicator', icon: '●', category: 'indicators', defaultSize: { width: 100, height: 32 }, bindingSlots: ['status'], description: 'OpenBridge status (NAMUR NE107)' }),
      obc({ type: 'obc.bar', label: 'Vertical Bar', icon: '📊', category: 'indicators', defaultSize: { width: 40, height: 120 }, bindingSlots: ['value'], hasAlarmLimits: true, description: 'OpenBridge progress bar' }),
      obc({ type: 'obc.bar-horizontal', label: 'Horizontal Bar', icon: '▬', category: 'indicators', defaultSize: { width: 120, height: 32 }, bindingSlots: ['value'], hasAlarmLimits: true, description: 'Horizontal bar graph' }),
      obc({ type: 'obc.badge', label: 'Badge / Tag', icon: '🏷️', category: 'indicators', defaultSize: { width: 80, height: 28 }, bindingSlots: ['text'], description: 'Equipment tag badge' }),
      custom({ type: 'ind.gauge', label: 'Circular Gauge', icon: '⏱️', category: 'indicators', defaultSize: { width: 120, height: 120 }, bindingSlots: ['value'], hasAlarmLimits: true, description: 'Analog gauge (OpenBridge styled)' }),
      custom({ type: 'ind.multistate', label: 'NAMUR Multi-State', icon: '🚦', category: 'indicators', defaultSize: { width: 48, height: 100 }, bindingSlots: ['status'], description: 'NE107 failure/check/maint/good' }),
      custom({ type: 'ind.digital', label: 'Digital Display', icon: '8️⃣', category: 'indicators', defaultSize: { width: 120, height: 48 }, bindingSlots: ['value'], description: 'High-contrast numeric faceplate' }),
      custom({ type: 'ind.setpoint', label: 'PV / SP Display', icon: '🎯', category: 'indicators', defaultSize: { width: 160, height: 72 }, bindingSlots: ['pv', 'sp'], description: 'Process vs setpoint comparison' }),
    ]
  },
  {
    id: 'controls',
    name: 'Controls',
    icon: '🎛️',
    symbols: [
      obc({ type: 'obc.button', label: 'Command Button', icon: '🔘', category: 'controls', defaultSize: { width: 100, height: 44 }, bindingSlots: ['command'], description: 'OpenBridge command button' }),
      obc({ type: 'obc.toggle', label: 'Toggle Switch', icon: '🔛', category: 'controls', defaultSize: { width: 60, height: 32 }, bindingSlots: ['state'], description: 'ON/OFF toggle' }),
      obc({ type: 'obc.slider', label: 'Vertical Slider', icon: '🎚️', category: 'controls', defaultSize: { width: 40, height: 150 }, bindingSlots: ['value', 'setpoint'], description: 'Setpoint slider' }),
      obc({ type: 'obc.slider-horizontal', label: 'Horizontal Slider', icon: '━', category: 'controls', defaultSize: { width: 150, height: 40 }, bindingSlots: ['value', 'setpoint'], description: 'Horizontal setpoint slider' }),
      obc({ type: 'obc.input', label: 'Numeric Input', icon: '⌨️', category: 'controls', defaultSize: { width: 120, height: 44 }, bindingSlots: ['value', 'setpoint'], description: 'Setpoint entry field' }),
      obc({ type: 'obc.check', label: 'Check Button', icon: '☑️', category: 'controls', defaultSize: { width: 100, height: 36 }, bindingSlots: ['state'], description: 'Selection checkbox' }),
      custom({ type: 'ctrl.selector', label: 'Selector Switch', icon: '🔄', category: 'controls', defaultSize: { width: 80, height: 80 }, bindingSlots: ['state'], description: 'Multi-position selector' }),
    ]
  },
  {
    id: 'equipment',
    name: 'Equipment (ISA-5.1)',
    icon: '⚙️',
    symbols: [
      custom({ type: 'equip.pump', label: 'Pump', icon: '⊛', category: 'equipment', defaultSize: { width: 80, height: 80 }, bindingSlots: ['status', 'speed'], description: 'Centrifugal pump' }),
      custom({ type: 'equip.valve', label: 'Control Valve', icon: '◇', category: 'equipment', defaultSize: { width: 60, height: 80 }, bindingSlots: ['position', 'status'], description: 'Modulating control valve' }),
      custom({ type: 'equip.valve-onoff', label: 'Block Valve', icon: '⬛', category: 'equipment', defaultSize: { width: 50, height: 50 }, bindingSlots: ['status'], description: 'On/off block valve' }),
      custom({ type: 'equip.motor', label: 'Motor', icon: 'Ⓜ', category: 'equipment', defaultSize: { width: 70, height: 70 }, bindingSlots: ['status', 'current'], description: 'Electric motor' }),
      custom({ type: 'equip.tank', label: 'Tank / Vessel', icon: '⬜', category: 'equipment', defaultSize: { width: 80, height: 120 }, bindingSlots: ['level', 'temperature'], hasAlarmLimits: true, description: 'Storage tank with level' }),
      custom({ type: 'equip.hx', label: 'Heat Exchanger', icon: '⊡', category: 'equipment', defaultSize: { width: 100, height: 60 }, bindingSlots: ['tempIn', 'tempOut'], description: 'Shell & tube HX' }),
      custom({ type: 'equip.compressor', label: 'Compressor', icon: '⊳', category: 'equipment', defaultSize: { width: 80, height: 80 }, bindingSlots: ['status', 'pressure'], description: 'Gas compressor' }),
      custom({ type: 'equip.fan', label: 'Fan / Blower', icon: '◎', category: 'equipment', defaultSize: { width: 70, height: 70 }, bindingSlots: ['status', 'speed'], description: 'Cooling fan' }),
      custom({ type: 'equip.heater', label: 'Heater', icon: '🔥', category: 'equipment', defaultSize: { width: 60, height: 80 }, bindingSlots: ['status', 'temperature'], description: 'Electric heater' }),
      custom({ type: 'equip.cooler', label: 'Cooler', icon: '❄️', category: 'equipment', defaultSize: { width: 60, height: 80 }, bindingSlots: ['status', 'temperature'], description: 'Cooling unit' }),
      custom({ type: 'equip.conveyor', label: 'Conveyor', icon: '➡️', category: 'equipment', defaultSize: { width: 200, height: 40 }, bindingSlots: ['status', 'speed'], description: 'Belt conveyor' }),
      custom({ type: 'equip.agitator', label: 'Agitator', icon: '🔃', category: 'equipment', defaultSize: { width: 60, height: 100 }, bindingSlots: ['status', 'speed'], description: 'Mixing agitator' }),
    ]
  },
  {
    id: 'instruments',
    name: 'Instruments (ISA-5.1)',
    icon: '🌡️',
    symbols: [
      custom({ type: 'inst.ti', label: 'TI – Temperature', icon: 'TI', category: 'instruments', defaultSize: { width: 50, height: 50 }, bindingSlots: ['value'], description: 'Temperature indicator' }),
      custom({ type: 'inst.pi', label: 'PI – Pressure', icon: 'PI', category: 'instruments', defaultSize: { width: 50, height: 50 }, bindingSlots: ['value'], description: 'Pressure indicator' }),
      custom({ type: 'inst.fi', label: 'FI – Flow', icon: 'FI', category: 'instruments', defaultSize: { width: 50, height: 50 }, bindingSlots: ['value'], description: 'Flow indicator' }),
      custom({ type: 'inst.li', label: 'LI – Level', icon: 'LI', category: 'instruments', defaultSize: { width: 50, height: 50 }, bindingSlots: ['value'], description: 'Level indicator' }),
      custom({ type: 'inst.ai', label: 'AI – Analyzer', icon: 'AI', category: 'instruments', defaultSize: { width: 50, height: 50 }, bindingSlots: ['value'], description: 'Analyzer indicator' }),
      custom({ type: 'inst.tt', label: 'TT – Transmitter', icon: 'TT', category: 'instruments', defaultSize: { width: 50, height: 50 }, bindingSlots: ['value'], description: 'Field transmitter' }),
    ]
  },
  {
    id: 'piping',
    name: 'Piping & Flow',
    icon: '━',
    symbols: [
      custom({ type: 'pipe.horizontal', label: 'Pipe (H)', icon: '━', category: 'piping', defaultSize: { width: 100, height: 6 }, bindingSlots: [], description: 'Horizontal pipe' }),
      custom({ type: 'pipe.vertical', label: 'Pipe (V)', icon: '┃', category: 'piping', defaultSize: { width: 6, height: 100 }, bindingSlots: [], description: 'Vertical pipe' }),
      custom({ type: 'pipe.elbow', label: 'Elbow', icon: '┗', category: 'piping', defaultSize: { width: 30, height: 30 }, bindingSlots: [], description: '90° elbow' }),
      custom({ type: 'pipe.tee', label: 'Tee', icon: '┳', category: 'piping', defaultSize: { width: 40, height: 40 }, bindingSlots: [], description: 'T-junction' }),
      custom({ type: 'pipe.reducer', label: 'Reducer', icon: '▷', category: 'piping', defaultSize: { width: 50, height: 20 }, bindingSlots: [], description: 'Pipe reducer' }),
      custom({ type: 'flow.arrow', label: 'Flow Arrow', icon: '➤', category: 'piping', defaultSize: { width: 30, height: 16 }, bindingSlots: [], description: 'Flow direction' }),
    ]
  },
  {
    id: 'shapes',
    name: 'Shapes & Layout',
    icon: '⬛',
    symbols: [
      obc({ type: 'obc.card', label: 'Card', icon: '⬜', category: 'shapes', defaultSize: { width: 200, height: 150 }, bindingSlots: [], description: 'OpenBridge grouping card' }),
      obc({ type: 'obc.elevated-card', label: 'Elevated Card', icon: '🗔', category: 'shapes', defaultSize: { width: 200, height: 150 }, bindingSlots: [], description: 'Elevated panel' }),
      custom({ type: 'shape.rect', label: 'Rectangle', icon: '▭', category: 'shapes', defaultSize: { width: 100, height: 60 }, bindingSlots: [], description: 'Rectangle shape' }),
      custom({ type: 'shape.circle', label: 'Circle', icon: '○', category: 'shapes', defaultSize: { width: 60, height: 60 }, bindingSlots: [], description: 'Circle / ellipse' }),
      custom({ type: 'shape.line', label: 'Line', icon: '╱', category: 'shapes', defaultSize: { width: 100, height: 4 }, bindingSlots: [], description: 'Straight line' }),
      custom({ type: 'shape.divider', label: 'Divider', icon: '─', category: 'shapes', defaultSize: { width: 200, height: 2 }, bindingSlots: [], description: 'Section divider' }),
    ]
  },
  {
    id: 'text',
    name: 'Text & Labels',
    icon: 'Aa',
    symbols: [
      custom({ type: 'text.label', label: 'Label', icon: 'Aa', category: 'text', defaultSize: { width: 100, height: 24 }, bindingSlots: [], description: 'Static text' }),
      custom({ type: 'text.title', label: 'Section Title', icon: 'Tt', category: 'text', defaultSize: { width: 200, height: 32 }, bindingSlots: [], description: 'Section header' }),
      custom({ type: 'text.dynamic', label: 'Dynamic Text', icon: '📝', category: 'text', defaultSize: { width: 120, height: 24 }, bindingSlots: ['text'], description: 'Bound text value' }),
      obc({ type: 'obc.clock', label: 'Clock', icon: '🕐', category: 'text', defaultSize: { width: 100, height: 32 }, bindingSlots: [], description: 'OpenBridge clock' }),
    ]
  },
  {
    id: 'alarms',
    name: 'Alarms (ISA-18.2)',
    icon: '🚨',
    symbols: [
      obc({ type: 'obc.alert-icon', label: 'Alert Icon', icon: '⚠️', category: 'alarms', defaultSize: { width: 40, height: 40 }, bindingSlots: ['state'], description: 'OpenBridge alert icon' }),
      obc({ type: 'obc.alert-button', label: 'Alert Button', icon: '🔔', category: 'alarms', defaultSize: { width: 100, height: 44 }, bindingSlots: ['alarms'], description: 'Alarm summary button' }),
      custom({ type: 'alarm.banner', label: 'Alarm Banner', icon: '📢', category: 'alarms', defaultSize: { width: 300, height: 40 }, bindingSlots: ['source'], description: 'Active alarm banner' }),
      custom({ type: 'alarm.beacon', label: 'Alarm Beacon', icon: '🔴', category: 'alarms', defaultSize: { width: 40, height: 40 }, bindingSlots: ['state'], description: 'Flashing alarm light' }),
      custom({ type: 'alarm.horn', label: 'Alarm Horn', icon: '📯', category: 'alarms', defaultSize: { width: 50, height: 50 }, bindingSlots: ['active'], description: 'Audible alarm indicator' }),
      custom({ type: 'alarm.summary', label: 'Alarm Summary', icon: '📋', category: 'alarms', defaultSize: { width: 180, height: 120 }, bindingSlots: ['source'], description: 'Mini alarm list' }),
    ]
  },
  {
    id: 'navigation',
    name: 'Navigation',
    icon: '🔗',
    symbols: [
      obc({ type: 'obc.nav-item', label: 'Nav Button', icon: '🔗', category: 'navigation', defaultSize: { width: 120, height: 44 }, bindingSlots: [], description: 'Navigate to display' }),
      obc({ type: 'obc.breadcrumb', label: 'Breadcrumb', icon: '📍', category: 'navigation', defaultSize: { width: 300, height: 32 }, bindingSlots: [], description: 'Navigation path' }),
      custom({ type: 'nav.faceplate', label: 'Faceplate Link', icon: '📋', category: 'navigation', defaultSize: { width: 32, height: 32 }, bindingSlots: ['asset'], description: 'Open faceplate popup' }),
    ]
  },
  {
    id: 'trends',
    name: 'Trends & Charts',
    icon: '📈',
    symbols: [
      custom({ type: 'chart.trend', label: 'Trend Chart', icon: '📈', category: 'trends', defaultSize: { width: 300, height: 180 }, bindingSlots: ['value'], description: 'Real-time trend' }),
      custom({ type: 'chart.sparkline', label: 'Sparkline', icon: '〰️', category: 'trends', defaultSize: { width: 100, height: 32 }, bindingSlots: ['value'], description: 'Mini trend line' }),
      custom({ type: 'chart.bar', label: 'Bar Chart', icon: '📊', category: 'trends', defaultSize: { width: 250, height: 160 }, bindingSlots: ['values'], description: 'Comparison bar chart' }),
      custom({ type: 'chart.xy', label: 'XY Plot', icon: '📉', category: 'trends', defaultSize: { width: 250, height: 180 }, bindingSlots: ['x', 'y'], description: 'Scatter / XY plot' }),
      custom({ type: 'chart.pie', label: 'Pie Chart', icon: '🥧', category: 'trends', defaultSize: { width: 120, height: 120 }, bindingSlots: ['values'], description: 'Distribution chart' }),
    ]
  },
];

/** Static categories always bundled; OpenBridge categories load on expand */
export const SYMBOL_LIBRARY: SymbolCategory[] = STATIC_SYMBOL_LIBRARY;

registerStaticCategories(STATIC_SYMBOL_LIBRARY);

export const SymbolPalette: React.FC<SymbolPaletteProps> = ({ onAddItem }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [lazyCategories, setLazyCategories] = useState<Map<string, SymbolCategory>>(new Map());
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(new Set());

  const loadLazyCategory = useCallback(async (categoryId: LazyCategoryId) => {
    if (lazyCategories.has(categoryId) || loadingCategories.has(categoryId)) return;
    setLoadingCategories(prev => new Set(prev).add(categoryId));
    preloadCategory(categoryId);
    try {
      const category = await ensureCategoryLoaded(categoryId);
      setLazyCategories(prev => new Map(prev).set(categoryId, category));
    } finally {
      setLoadingCategories(prev => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    }
  }, [lazyCategories, loadingCategories]);

  const toggleCategory = (id: string) => {
    const isLazy = LAZY_CATEGORY_META.some(m => m.id === id);
    const willExpand = !expandedCategories.has(id);

    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    if (isLazy && willExpand) {
      void loadLazyCategory(id as LazyCategoryId);
    }
  };

  const allCategories = useMemo((): SymbolCategory[] => {
    const lazyLoaded = LAZY_CATEGORY_META
      .map(meta => lazyCategories.get(meta.id) ?? {
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        symbols: [] as SymbolDefinition[],
      })
      .filter(cat => !searchTerm || cat.symbols.length > 0 || loadingCategories.has(cat.id));

    return [...lazyLoaded, ...STATIC_SYMBOL_LIBRARY];
  }, [lazyCategories, loadingCategories, searchTerm]);  
  const handleDragStart = (e: React.DragEvent, symbol: SymbolDefinition) => {
    e.dataTransfer.setData('application/symbol-type', symbol.type);
    e.dataTransfer.setData('application/symbol-data', JSON.stringify(symbol));
    e.dataTransfer.effectAllowed = 'copy';
    
    const preview = document.createElement('div');
    preview.className = 'drag-preview';
    preview.textContent = symbol.icon;
    preview.style.cssText = 'position:absolute;left:-1000px;font-size:32px;';
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 20, 20);
    setTimeout(() => preview.remove(), 0);
  };
  
  const filteredLibrary = searchTerm
    ? allCategories.map(cat => ({
        ...cat,
        symbols: cat.symbols.filter(s =>
          s.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.description?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      })).filter(cat => cat.symbols.length > 0)
    : allCategories;  
  return (
    <div className="symbol-palette">
      <div className="symbol-palette__header">
        <h3>🧰 HMI Components</h3>
      </div>
      
      <div className="symbol-palette__search">
        <input
          type="text"
          placeholder="Search components..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="symbol-palette__search-clear" onClick={() => setSearchTerm('')}>
            ✕
          </button>
        )}
      </div>
      
      <div className="symbol-palette__categories">
        {filteredLibrary.map(category => (
          <div key={category.id} className="symbol-palette__category">
            <button
              className={`symbol-palette__category-header ${expandedCategories.has(category.id) ? 'expanded' : ''}`}
              onClick={() => toggleCategory(category.id)}
            >
              <span className="symbol-palette__category-icon">{category.icon}</span>
              <span className="symbol-palette__category-name">{category.name}</span>
              <span className="symbol-palette__category-count">
                {loadingCategories.has(category.id)
                  ? '…'
                  : category.symbols.length || (LAZY_CATEGORY_META.some(m => m.id === category.id) ? '↓' : 0)}
              </span>              <span className="symbol-palette__category-chevron">
                {expandedCategories.has(category.id) ? '▼' : '▶'}
              </span>
            </button>
            
            {expandedCategories.has(category.id) && (
              <div className="symbol-palette__symbols">
                {loadingCategories.has(category.id) && (
                  <div className="symbol-palette__loading">Loading components…</div>
                )}
                {!loadingCategories.has(category.id) && category.symbols.length === 0 && LAZY_CATEGORY_META.some(m => m.id === category.id) && (
                  <div className="symbol-palette__loading">Expand to load OpenBridge components</div>
                )}
                {category.symbols.map(symbol => (                  <div
                    key={symbol.type}
                    className={`symbol-palette__item ${symbol.isOpenBridge ? 'symbol-palette__item--obc' : 'symbol-palette__item--custom'}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, symbol)}
                    onDoubleClick={() => onAddItem(symbol.type, { x: 100, y: 100 })}
                    title={symbol.description || symbol.label}
                  >
                    <div className="symbol-palette__item-icon">{symbol.icon}</div>
                    <div className="symbol-palette__item-info">
                      <div className="symbol-palette__item-label">
                        {symbol.label}
                        <span className={`symbol-palette__badge ${symbol.isOpenBridge ? 'symbol-palette__badge--obc' : 'symbol-palette__badge--custom'}`}>
                          {symbol.isOpenBridge ? 'OBC' : 'SVG'}
                        </span>
                      </div>
                      {symbol.bindingSlots.length > 0 && (
                        <div className="symbol-palette__item-bindings">
                          {symbol.bindingSlots.slice(0, 2).join(', ')}
                          {symbol.bindingSlots.length > 2 && '...'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="symbol-palette__hint">
        <span>💡</span> Drag to canvas or double-click to add
      </div>
      
      <div className="symbol-palette__standards">
        <small>
          <span className="symbol-palette__legend-obc">OBC</span> = OpenBridge ·
          <span className="symbol-palette__legend-custom"> SVG</span> = Custom (OpenBridge themed)
        </small>
      </div>
    </div>
  );
};

export default SymbolPalette;
