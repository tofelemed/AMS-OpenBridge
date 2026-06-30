import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { CanvasItem } from './types';
import { SymbolRenderer } from './SymbolRenderer';
import { SYMBOL_LIBRARY } from './SymbolPalette';

interface DesignerCanvasProps {
  items: CanvasItem[];
  selectedId: string | null;
  mode: 'design' | 'preview';
  gridSize?: number;
  showGrid?: boolean;
  zoom?: number;
  onSelectItem: (id: string | null) => void;
  onUpdateItem: (id: string, updates: Partial<CanvasItem>) => void;
  onAddItem: (type: string, position: { x: number; y: number }) => void;
  onDeleteItem?: (id: string) => void;
}

// Get default size for a symbol type
function getDefaultSize(type: string): { width: number; height: number } {
  for (const cat of SYMBOL_LIBRARY) {
    const sym = cat.symbols.find(s => s.type === type);
    if (sym) return sym.defaultSize;
  }
  return { width: 100, height: 60 };
}

// Snap to grid
function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export const DesignerCanvas: React.FC<DesignerCanvasProps> = ({
  items,
  selectedId,
  mode,
  gridSize = 10,
  showGrid = true,
  zoom = 1,
  onSelectItem,
  onUpdateItem,
  onAddItem,
  onDeleteItem
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; itemX: number; itemY: number }>({ x: 0, y: 0, itemX: 0, itemY: 0 });
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number; itemX: number; itemY: number }>({ x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 });
  const [selectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'design' || !selectedId) return;
      
      const selectedItem = items.find(i => i.id === selectedId);
      if (!selectedItem || selectedItem.locked) return;
      
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (onDeleteItem) {
            e.preventDefault();
            onDeleteItem(selectedId);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          onUpdateItem(selectedId, { position: { ...selectedItem.position, y: selectedItem.position.y - (e.shiftKey ? 10 : 1) } });
          break;
        case 'ArrowDown':
          e.preventDefault();
          onUpdateItem(selectedId, { position: { ...selectedItem.position, y: selectedItem.position.y + (e.shiftKey ? 10 : 1) } });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onUpdateItem(selectedId, { position: { ...selectedItem.position, x: selectedItem.position.x - (e.shiftKey ? 10 : 1) } });
          break;
        case 'ArrowRight':
          e.preventDefault();
          onUpdateItem(selectedId, { position: { ...selectedItem.position, x: selectedItem.position.x + (e.shiftKey ? 10 : 1) } });
          break;
        case 'Escape':
          onSelectItem(null);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, selectedId, items, onUpdateItem, onDeleteItem, onSelectItem]);
  
  // Drop handler for adding new items
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const symbolType = e.dataTransfer.getData('application/symbol-type');
    if (!symbolType || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snapToGrid((e.clientX - rect.left) / zoom, gridSize);
    const y = snapToGrid((e.clientY - rect.top) / zoom, gridSize);
    
    const defaultSize = getDefaultSize(symbolType);
    const centeredX = x - defaultSize.width / 2;
    const centeredY = y - defaultSize.height / 2;
    
    onAddItem(symbolType, { x: centeredX, y: centeredY });
  }, [zoom, gridSize, onAddItem]);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  
  // Canvas click to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      onSelectItem(null);
    }
  }, [onSelectItem]);
  
  // Item mouse down for dragging
  const handleItemMouseDown = useCallback((e: React.MouseEvent, item: CanvasItem) => {
    if (mode !== 'design' || item.locked) return;
    e.stopPropagation();
    
    onSelectItem(item.id);
    
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        itemX: item.position.x,
        itemY: item.position.y
      });
    }
  }, [mode, onSelectItem]);
  
  // Resize handle mouse down
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, item: CanvasItem, handle: string) => {
    if (mode !== 'design' || item.locked) return;
    e.stopPropagation();
    
    setIsResizing(true);
    setResizeHandle(handle);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: item.size.width,
      height: item.size.height,
      itemX: item.position.x,
      itemY: item.position.y
    });
  }, [mode]);
  
  // Mouse move for dragging/resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedId) return;
      
      if (isDragging) {
        const dx = (e.clientX - dragStart.x) / zoom;
        const dy = (e.clientY - dragStart.y) / zoom;
        
        onUpdateItem(selectedId, {
          position: {
            x: snapToGrid(dragStart.itemX + dx, gridSize),
            y: snapToGrid(dragStart.itemY + dy, gridSize)
          }
        });
      }
      
      if (isResizing && resizeHandle) {
        const dx = (e.clientX - resizeStart.x) / zoom;
        const dy = (e.clientY - resizeStart.y) / zoom;
        
        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.itemX;
        let newY = resizeStart.itemY;
        
        if (resizeHandle.includes('e')) newWidth = Math.max(20, resizeStart.width + dx);
        if (resizeHandle.includes('w')) {
          newWidth = Math.max(20, resizeStart.width - dx);
          newX = resizeStart.itemX + dx;
        }
        if (resizeHandle.includes('s')) newHeight = Math.max(20, resizeStart.height + dy);
        if (resizeHandle.includes('n')) {
          newHeight = Math.max(20, resizeStart.height - dy);
          newY = resizeStart.itemY + dy;
        }
        
        onUpdateItem(selectedId, {
          position: { x: snapToGrid(newX, gridSize), y: snapToGrid(newY, gridSize) },
          size: { width: snapToGrid(newWidth, gridSize), height: snapToGrid(newHeight, gridSize) }
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
    };
    
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, selectedId, dragStart, resizeStart, resizeHandle, zoom, gridSize, onUpdateItem]);
  
  // Sort items by z-index
  const sortedItems = [...items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  
  return (
    <div className="designer-canvas-wrapper">
      {/* Toolbar */}
      {mode === 'design' && (
        <div className="designer-canvas-toolbar">
          <div className="designer-canvas-toolbar__group">
            <span className="designer-canvas-toolbar__label">Zoom:</span>
            <span className="designer-canvas-toolbar__value">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="designer-canvas-toolbar__group">
            <span className="designer-canvas-toolbar__label">Grid:</span>
            <span className="designer-canvas-toolbar__value">{gridSize}px</span>
          </div>
          <div className="designer-canvas-toolbar__group">
            <span className="designer-canvas-toolbar__label">Items:</span>
            <span className="designer-canvas-toolbar__value">{items.length}</span>
          </div>
          {selectedId && (
            <div className="designer-canvas-toolbar__group">
              <span className="designer-canvas-toolbar__selected">✓ Selected</span>
            </div>
          )}
        </div>
      )}
      
      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`designer-canvas ${mode === 'preview' ? 'designer-canvas--preview' : ''} ${isDragging ? 'designer-canvas--dragging' : ''}`}
        style={{
          backgroundSize: showGrid && mode === 'design' ? `${gridSize * zoom}px ${gridSize * zoom}px` : undefined,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleCanvasClick}
      >
        {/* Grid dots */}
        {showGrid && mode === 'design' && (
          <div className="designer-canvas__grid" />
        )}
        
        {/* Render items */}
        {sortedItems.map(item => {
          const isSelected = selectedId === item.id;
          
          return (
            <div
              key={item.id}
              className={`designer-canvas__item ${isSelected ? 'designer-canvas__item--selected' : ''} ${item.locked ? 'designer-canvas__item--locked' : ''}`}
              style={{
                left: item.position.x,
                top: item.position.y,
                width: item.size.width,
                height: item.size.height,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                zIndex: item.zIndex || 0,
              }}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
            >
              <SymbolRenderer item={item} mode={mode} />
              
              {/* Selection handles */}
              {isSelected && mode === 'design' && !item.locked && (
                <div className="designer-canvas__handles">
                  <div className="designer-canvas__handle designer-canvas__handle--nw" onMouseDown={(e) => handleResizeMouseDown(e, item, 'nw')} />
                  <div className="designer-canvas__handle designer-canvas__handle--n" onMouseDown={(e) => handleResizeMouseDown(e, item, 'n')} />
                  <div className="designer-canvas__handle designer-canvas__handle--ne" onMouseDown={(e) => handleResizeMouseDown(e, item, 'ne')} />
                  <div className="designer-canvas__handle designer-canvas__handle--e" onMouseDown={(e) => handleResizeMouseDown(e, item, 'e')} />
                  <div className="designer-canvas__handle designer-canvas__handle--se" onMouseDown={(e) => handleResizeMouseDown(e, item, 'se')} />
                  <div className="designer-canvas__handle designer-canvas__handle--s" onMouseDown={(e) => handleResizeMouseDown(e, item, 's')} />
                  <div className="designer-canvas__handle designer-canvas__handle--sw" onMouseDown={(e) => handleResizeMouseDown(e, item, 'sw')} />
                  <div className="designer-canvas__handle designer-canvas__handle--w" onMouseDown={(e) => handleResizeMouseDown(e, item, 'w')} />
                </div>
              )}
              
              {/* Lock indicator */}
              {item.locked && mode === 'design' && (
                <div className="designer-canvas__lock-indicator">🔒</div>
              )}
            </div>
          );
        })}
        
        {/* Selection box (for multi-select) */}
        {selectionBox && (
          <div
            className="designer-canvas__selection-box"
            style={{
              left: selectionBox.x,
              top: selectionBox.y,
              width: selectionBox.width,
              height: selectionBox.height
            }}
          />
        )}
        
        {/* Empty state */}
        {items.length === 0 && mode === 'design' && (
          <div className="designer-canvas__empty">
            <div className="designer-canvas__empty-icon">🎨</div>
            <div className="designer-canvas__empty-title">Empty Canvas</div>
            <div className="designer-canvas__empty-hint">
              Drag components from the palette or double-click to add
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DesignerCanvas;
