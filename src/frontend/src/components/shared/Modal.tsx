import React, { useCallback, useEffect, useRef } from 'react';

// ============================================================
// Reusable Modal — Glassmorphism overlay with keyboard support
// ============================================================

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
      // Focus trap
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

  const accentColor =
    variant === 'danger'  ? 'var(--alarm-critical)' :
    variant === 'warning' ? 'var(--color-warning)' :
    variant === 'success' ? 'var(--color-success)' :
    'var(--accent-blue)';

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal, 1000)' as any,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className="modal-content"
        style={{
          width,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
          position: 'relative',
        }}>
          {/* Accent stripe */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: `linear-gradient(90deg, ${accentColor}, transparent)`,
          }} />

          {icon && (
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: `${accentColor}15`,
              border: `1px solid ${accentColor}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              flexShrink: 0,
            }}>
              {icon}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
            }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginTop: '4px',
                lineHeight: 1.4,
              }}>
                {subtitle}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '16px',
              lineHeight: 1,
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'var(--color-bg-hover)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'none';
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          overflowY: 'auto',
          flex: 1,
        }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: 'var(--space-4) var(--space-6)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-3)',
            background: 'var(--color-bg-tertiary)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Form field helpers ----

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({ label, required, hint, error, children }) => (
  <div style={{ marginBottom: 'var(--space-4)' }}>
    <label style={{
      display: 'block',
      fontSize: '12px',
      fontWeight: 600,
      color: 'var(--text-secondary)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: 'var(--space-2)',
    }}>
      {label}
      {required && <span style={{ color: 'var(--alarm-critical)', marginLeft: '4px' }}>*</span>}
    </label>
    {children}
    {hint && !error && (
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{hint}</div>
    )}
    {error && (
      <div style={{ fontSize: '11px', color: 'var(--alarm-critical)', marginTop: '4px' }}>⚠ {error}</div>
    )}
  </div>
);
