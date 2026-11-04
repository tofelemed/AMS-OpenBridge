/**
 * A non-modal popover anchored to its trigger: the header's plant selector, time range and user
 * menu. Esc closes and returns focus to the trigger. A click outside closes without moving focus.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { focusInitial } from '../hooks/focusTrap';

export interface PopoverTriggerProps {
  ref: React.RefObject<HTMLButtonElement>;
  'aria-expanded': boolean;
  'aria-controls': string;
  onClick: () => void;
}

export const Popover: React.FC<{
  /** Names the panel for assistive technology. */
  label: string;
  trigger: (props: PopoverTriggerProps) => React.ReactNode;
  align?: 'start' | 'end';
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}> = ({ label, trigger, align = 'start', children }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    focusInitial(panelRef.current);
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div className="ui-popover">
      {trigger({ ref: triggerRef, 'aria-expanded': open, 'aria-controls': id, onClick: () => setOpen(o => !o) })}
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="group"
          aria-label={label}
          tabIndex={-1}
          className={`ui-popover__panel ui-popover__panel--${align}`}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
};
