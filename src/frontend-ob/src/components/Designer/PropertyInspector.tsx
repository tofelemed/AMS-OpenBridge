import React, { useState } from 'react';
import type { CanvasItem, FormattingOptions, ItemStyle, AlarmLimits } from './types';
import { TagPicker } from './AssetBrowser';
import { SYMBOL_LIBRARY } from './SymbolPalette';

interface PropertyInspectorProps {
  selectedItem: CanvasItem | undefined;
  // selectedItems for future multi-select support
  // selectedItems?: CanvasItem[];
  onUpdateItem: (id: string, updates: Partial<CanvasItem>) => void;
  onDeleteItem?: (id: string) => void;
  onDuplicateItem?: (id: string) => void;
}

// Get symbol definition from library
function getSymbolDef(type: string) {
  for (const cat of SYMBOL_LIBRARY) {
    const sym = cat.symbols.find(s => s.type === type);
    if (sym) return sym;
  }
  return null;
}

// Color presets for quick selection
const COLOR_PRESETS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#0f172a', '#000000', 'transparent'
];

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  selectedItem,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'bindings' | 'style' | 'limits'>('general');
  
  if (!selectedItem) {
    return (
      <div className="property-inspector">
        <div className="property-inspector__header">
          <h3>⚙️ Properties</h3>
        </div>
        <div className="property-inspector__empty">
          <div className="property-inspector__empty-icon">👆</div>
          <p>Select an item to edit its properties</p>
          <small>Click on any element on the canvas</small>
        </div>
      </div>
    );
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
  
  const updatePosition = (axis: 'x' | 'y', value: number) => {
    updateItem({ position: { ...selectedItem.position, [axis]: value } });
  };
  
  const updateSize = (dim: 'width' | 'height', value: number) => {
    updateItem({ size: { ...selectedItem.size, [dim]: value } });
  };
  
  return (
    <div className="property-inspector">
      <div className="property-inspector__header">
        <h3>⚙️ Properties</h3>
        <div className="property-inspector__actions">
          {onDuplicateItem && (
            <button
              className="property-inspector__action"
              onClick={() => onDuplicateItem(selectedItem.id)}
              title="Duplicate"
            >
              📋
            </button>
          )}
          {onDeleteItem && (
            <button
              className="property-inspector__action property-inspector__action--danger"
              onClick={() => onDeleteItem(selectedItem.id)}
              title="Delete"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      
      <div className="property-inspector__type-badge">
        {symbolDef?.icon || '📦'} {symbolDef?.label || selectedItem.type}
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
      </div>
      
      <div className="property-inspector__content">
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* GENERAL TAB */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'general' && (
          <>
            <div className="property-section">
              <div className="property-section__title">📝 Label</div>
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
            
            <div className="property-section">
              <div className="property-section__title">📍 Position</div>
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
              <div className="property-section__title">📐 Size</div>
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
              <div className="property-section__title">🔄 Transform</div>
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
                  <span>🔒 Locked</span>
                </label>
              </div>
            </div>
          </>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* BINDINGS TAB */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'bindings' && (
          <>
            <div className="property-section">
              <div className="property-section__title">🔗 Data Bindings</div>
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
                <div className="property-section__title">🔢 Formatting</div>
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
              <div className="property-section__title">🎨 Colors</div>
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
              <div className="property-section__title">🔤 Text</div>
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
                      {align === 'left' ? '⬅️' : align === 'center' ? '↔️' : '➡️'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="property-section">
              <div className="property-section__title">📦 Border</div>
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
              <div className="property-section__title">🚨 Alarm Limits</div>
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
