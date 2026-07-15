import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Render a divider ABOVE this item. */
  divider?: boolean;
}

/**
 * A lightweight, absolutely-positioned right-click menu. Closes on outside click or Escape.
 * Rendered by DisplayDesigner (which owns the edit handlers); the canvas only emits the event.
 */
export const ContextMenu: React.FC<{
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }} role="menu" data-testid="context-menu">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {it.divider && <div className="ctx-menu__divider" />}
          <button
            type="button"
            role="menuitem"
            className={`ctx-menu__item${it.danger ? ' ctx-menu__item--danger' : ''}`}
            disabled={it.disabled}
            onClick={() => { it.onClick(); onClose(); }}
          >
            {it.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;
