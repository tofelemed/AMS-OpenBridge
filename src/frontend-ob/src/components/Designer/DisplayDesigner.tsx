import React, { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SymbolPalette } from './SymbolPalette';
import { PropertyInspector } from './PropertyInspector';
import { DesignerCanvas } from './DesignerCanvas';
import { AssetBrowser } from './AssetBrowser';
import type { CanvasItem } from './types';
import { isAutomationType, getDefaultAutomationProps } from './automationTypes';
import { isObcCatalogType, getDefaultObcProps } from './obcCatalogTypes';
import { getDefaultSizeSync } from './symbolLibraryService';
import { preloadForSymbolTypes } from './lazyCategoryRegistry';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface DisplayDesignerProps {
  displayId: string;
  onClose?: () => void;
  onSave?: () => void;
}

interface DisplayData {
  id: string;
  name: string;
  path: string;
  displayType: string;
  aspectRatio: string;
  content: {
    items: CanvasItem[];
    settings?: DisplaySettings;
  };
}

interface DisplaySettings {
  gridSize: number;
  showGrid: boolean;
  backgroundColor: string;
  canvasWidth: number;
  canvasHeight: number;
}

// Generate unique ID
function generateId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get default size for a symbol type
function getDefaultSize(type: string): { width: number; height: number } {
  return getDefaultSizeSync(type);
}

// Fetch display content
// display-service returns { ..., snapshot: { items, settings } }; adapt to { content }.
async function fetchDisplay(id: string): Promise<DisplayData> {
  const res = await fetch(`${API_BASE}/${id}/content`);
  if (!res.ok) throw new Error('Failed to load display');
  const json = await res.json();
  const snapshot = json.snapshot ?? json.content ?? {};
  return { ...json, content: { items: snapshot.items ?? [], settings: snapshot.settings } } as DisplayData;
}

// Save display content — backend contract is { snapshot, changeNote, userId }.
async function saveDisplay(id: string, content: DisplayData['content']): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot: content, changeNote: 'designer save', userId: 'designer-user' })
  });
  if (!res.ok) throw new Error('Failed to save display');
}

export const DisplayDesigner: React.FC<DisplayDesignerProps> = ({
  displayId,
  onClose,
  onSave
}) => {
  const queryClient = useQueryClient();
  
  // State
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize] = useState(10);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [history, setHistory] = useState<CanvasItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Fetch display data
  const { data: displayData, isLoading, error } = useQuery({
    queryKey: ['display', displayId],
    queryFn: () => fetchDisplay(displayId)
  });
  
  // Load items from fetched data
  useEffect(() => {
    if (displayData?.content?.items) {
      setItems(displayData.content.items);
      setHistory([displayData.content.items]);
      setHistoryIndex(0);
    }
  }, [displayData]);

  // Preload OpenBridge renderer chunks for symbols already on the canvas
  useEffect(() => {
    if (items.length > 0) {
      preloadForSymbolTypes(items.map(i => i.type));
    }
  }, [items]);
  
  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () => saveDisplay(displayId, { items, settings: { gridSize, showGrid, backgroundColor: '#0f172a', canvasWidth: 1920, canvasHeight: 1080 } }),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['display', displayId] });
      onSave?.();
    }
  });
  
  // History management
  const pushHistory = useCallback((newItems: CanvasItem[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newItems);
      return newHistory.slice(-50); // Keep last 50 states
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);
  
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setItems(history[historyIndex - 1]);
      setIsDirty(true);
    }
  }, [history, historyIndex]);
  
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setItems(history[historyIndex + 1]);
      setIsDirty(true);
    }
  }, [history, historyIndex]);
  
  // Item operations
  const addItem = useCallback((type: string, position: { x: number; y: number }) => {
    const defaultSize = getDefaultSize(type);
    const newItem: CanvasItem = {
      id: generateId(),
      type,
      position,
      size: defaultSize,
      label: '',
      bindings: {},
      formatting: { decimals: 1 },
      ...(isAutomationType(type) ? { automationProps: getDefaultAutomationProps(type) } : {}),
      ...(isObcCatalogType(type) ? { obcProps: getDefaultObcProps(type) } : {}),
    };
    
    const newItems = [...items, newItem];
    setItems(newItems);
    pushHistory(newItems);
    setSelectedId(newItem.id);
    setIsDirty(true);
  }, [items, pushHistory]);
  
  const updateItem = useCallback((id: string, updates: Partial<CanvasItem>) => {
    const newItems = items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    );
    setItems(newItems);
    setIsDirty(true);
  }, [items]);
  
  const deleteItem = useCallback((id: string) => {
    const newItems = items.filter(item => item.id !== id);
    setItems(newItems);
    pushHistory(newItems);
    if (selectedId === id) setSelectedId(null);
    setIsDirty(true);
  }, [items, selectedId, pushHistory]);
  
  const duplicateItem = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    const newItem: CanvasItem = {
      ...item,
      id: generateId(),
      position: {
        x: item.position.x + 20,
        y: item.position.y + 20
      }
    };
    
    const newItems = [...items, newItem];
    setItems(newItems);
    pushHistory(newItems);
    setSelectedId(newItem.id);
    setIsDirty(true);
  }, [items, pushHistory]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            saveMutation.mutate();
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 'd':
            e.preventDefault();
            if (selectedId) duplicateItem(selectedId);
            break;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveMutation, undo, redo, duplicateItem, selectedId]);
  
  const selectedItem = items.find(i => i.id === selectedId);
  
  if (isLoading) {
    return (
      <div className="display-designer display-designer--loading">
        <div className="display-designer__loading-spinner">⏳</div>
        <div>Loading display...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="display-designer display-designer--error">
        <div className="display-designer__error-icon">❌</div>
        <div>Failed to load display</div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['display', displayId] })}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="display-designer">
      {/* Header Toolbar */}
      <header className="display-designer__header">
        <div className="display-designer__header-left">
          <button className="display-designer__back-btn" onClick={onClose}>
            ← Back
          </button>
          <div className="display-designer__title">
            <span className="display-designer__name">{displayData?.name || 'Untitled'}</span>
            {isDirty && <span className="display-designer__dirty">●</span>}
          </div>
        </div>
        
        <div className="display-designer__header-center">
          {/* Mode Toggle */}
          <div className="display-designer__mode-toggle">
            <button
              className={`display-designer__mode-btn ${mode === 'design' ? 'active' : ''}`}
              onClick={() => setMode('design')}
            >
              ✏️ Design
            </button>
            <button
              className={`display-designer__mode-btn ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              ▶️ Preview
            </button>
          </div>
          
          {/* Zoom Controls */}
          <div className="display-designer__zoom-controls">
            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.25))}>+</button>
            <button onClick={() => setZoom(1)}>100%</button>
          </div>
        </div>
        
        <div className="display-designer__header-right">
          {/* History */}
          <div className="display-designer__history">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              title="Undo (Ctrl+Z)"
            >
              ↩️
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title="Redo (Ctrl+Y)"
            >
              ↪️
            </button>
          </div>
          
          {/* View Options */}
          <div className="display-designer__view-options">
            <label className="display-designer__checkbox">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              Grid
            </label>
            <button
              className={`display-designer__toggle ${showAssetBrowser ? 'active' : ''}`}
              onClick={() => setShowAssetBrowser(!showAssetBrowser)}
              title="Asset Browser"
            >
              🏷️
            </button>
          </div>
          
          {/* Save */}
          <button
            className="display-designer__save-btn"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
          >
            {saveMutation.isPending ? '💾 Saving...' : '💾 Save'}
          </button>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="display-designer__body">
        {/* Left Panel - Symbol Palette */}
        {mode === 'design' && (
          <aside className="display-designer__sidebar display-designer__sidebar--left">
            <SymbolPalette onAddItem={addItem} />
          </aside>
        )}
        
        {/* Center - Canvas */}
        <main className="display-designer__main">
          <DesignerCanvas
            items={items}
            selectedId={selectedId}
            mode={mode}
            gridSize={gridSize}
            showGrid={showGrid}
            zoom={zoom}
            onSelectItem={setSelectedId}
            onUpdateItem={updateItem}
            onAddItem={addItem}
            onDeleteItem={deleteItem}
          />
        </main>
        
        {/* Right Panel - Properties / Asset Browser */}
        {mode === 'design' && (
          <aside className="display-designer__sidebar display-designer__sidebar--right">
            {showAssetBrowser ? (
              <AssetBrowser
                selectedPath={selectedItem?.bindings?.value}
                onSelectPath={(path) => {
                  if (selectedId && selectedItem) {
                    updateItem(selectedId, {
                      bindings: { ...selectedItem.bindings, value: path }
                    });
                  }
                }}
              />
            ) : (
              <PropertyInspector
                selectedItem={selectedItem}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
                onDuplicateItem={duplicateItem}
              />
            )}
          </aside>
        )}
      </div>
      
      {/* Footer Status Bar */}
      <footer className="display-designer__footer">
        <div className="display-designer__footer-left">
          <span>{displayData?.displayType || 'overview'}</span>
          <span>•</span>
          <span>{displayData?.aspectRatio || '16:9'}</span>
        </div>
        <div className="display-designer__footer-center">
          {selectedItem && (
            <span>
              Selected: {selectedItem.type} at ({selectedItem.position.x}, {selectedItem.position.y})
            </span>
          )}
        </div>
        <div className="display-designer__footer-right">
          <span>{items.length} items</span>
          <span>•</span>
          <span>Grid: {gridSize}px</span>
        </div>
      </footer>
    </div>
  );
};

export default DisplayDesigner;
