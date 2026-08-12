'use client';

import React, { useEffect, useRef } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  contentClassName?: string;
  overlayClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  width = '480px',
  variant = 'default',
  contentClassName,
  overlayClassName,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Keep the latest onClose in a ref so the open/keydown effect below does NOT
  // depend on it. Callers pass an inline `onClose` that changes identity every
  // render; if the effect depended on it, it would re-run on every keystroke and
  // call contentRef.focus(), stealing focus from whatever input is being typed in.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Runs only when the modal opens/closes — focuses the dialog once on open,
  // traps Tab within it (J: keyboard users used to Tab out into the dimmed page,
  // incl. the destructive buttons underneath), and restores focus on close.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] => {
      const root = contentRef.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(el => el.offsetParent !== null || el === document.activeElement);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) { e.preventDefault(); contentRef.current?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || active === contentRef.current)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    // Focus the first interactive control if there is one, else the dialog itself.
    const items = focusable();
    (items[0] ?? contentRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={['dialog-overlay', overlayClassName].filter(Boolean).join(' ')}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className={['dialog-content', `dialog-content--${variant}`, contentClassName].filter(Boolean).join(' ')}
        style={{ width, outline: 'none' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className={`dialog-header dialog-header--${variant}`}>
          <div className={`dialog-header__accent dialog-header__accent--${variant}`} />
          <div className="dialog-header__row">
            {icon && (
              <div className={`dialog-header__icon dialog-header__icon--${variant}`}>
                {icon}
              </div>
            )}
            <div className="dialog-header__text">
              <h2 id="dialog-title" className="dialog-title">{title}</h2>
              {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
            </div>
            <ObcButton variant="flat" size="small" onClick={onClose} aria-label="Close dialog">
              ✕
            </ObcButton>
          </div>
        </div>

        <div className="dialog-body">{children}</div>

        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
};

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({ label, required, hint, error, children }) => (
  <div className="form-field">
    <label className="form-field__label">
      {label}
      {required && <span className="form-field__required">*</span>}
    </label>
    {children}
    {hint && !error && <div className="form-field__hint">{hint}</div>}
    {error && <div className="form-field__error">⚠ {error}</div>}
  </div>
);
