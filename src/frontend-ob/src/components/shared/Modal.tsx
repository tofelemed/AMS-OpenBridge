'use client';

import React, { useCallback, useEffect, useRef } from 'react';
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      contentRef.current?.focus();
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

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
