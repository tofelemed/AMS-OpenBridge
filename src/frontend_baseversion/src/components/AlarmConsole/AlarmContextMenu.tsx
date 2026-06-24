import React, { useEffect, useRef } from 'react';
import { ActiveAlarm } from '../../store/alarmStore';
import { isOpcAckWriteable, opcAckSkipReason } from '../../utils/opcAckWriteable';

// ============================================================
// Alarm Context Menu — OPC AE 1.10 right-click operations
// Professional styling with hover effects, icons, and
// keyboard-accessible menu items.
// ============================================================

interface AlarmContextMenuProps {
  alarm: ActiveAlarm;
  x: number;
  y: number;
  onClose: () => void;
  onAcknowledge: (alarm: ActiveAlarm) => void;
  onShelve: (alarm: ActiveAlarm) => void;
  onSuppress: (alarm: ActiveAlarm) => void;
  onOutOfService: (alarm: ActiveAlarm) => void;
  onViewDetails: (alarm: ActiveAlarm) => void;
}

interface MenuItem {
  icon: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onClick: () => void;
}

export const AlarmContextMenu: React.FC<AlarmContextMenuProps> = ({
  alarm,
  x,
  y,
  onClose,
  onAcknowledge,
  onShelve,
  onSuppress,
  onOutOfService,
  onViewDetails,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Ensure the menu stays in viewport
  const adjustedX = Math.min(x, window.innerWidth - 260);
  const adjustedY = Math.min(y, window.innerHeight - 400);

  const menuItems: MenuItem[] = [
    {
      icon: '✓',
      label: 'Acknowledge',
      shortcut: 'F2',
      disabled: alarm.acknowledged || !isOpcAckWriteable(alarm),
      onClick: () => onAcknowledge(alarm),
    },
    {
      icon: '📥',
      label: alarm.isShelved ? 'Unshelve' : 'Shelve...',
      onClick: () => onShelve(alarm),
      separator: false,
    },
    {
      icon: '🔇',
      label: alarm.isSuppressed ? 'Unsuppress' : 'Suppress...',
      disabled: alarm.isSuppressed,
      onClick: () => onSuppress(alarm),
    },
    {
      icon: '🔧',
      label: alarm.isOutOfService ? 'Return to Service' : 'Set Out of Service...',
      disabled: alarm.isOutOfService,
      danger: true,
      onClick: () => onOutOfService(alarm),
      separator: true,
    },
    {
      icon: '📋',
      label: 'View Details',
      shortcut: 'Dbl-Click',
      onClick: () => onViewDetails(alarm),
    },
    {
      icon: '📎',
      label: 'Copy Source Name',
      onClick: () => {
        navigator.clipboard?.writeText(alarm.sourceName);
        onClose();
      },
      separator: false,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="context-menu"
      style={{
        position: 'fixed',
        top: `${adjustedY}px`,
        left: `${adjustedX}px`,
        zIndex: 10000,
        animation: 'slideUp 0.15s ease-out',
      }}
    >
      {/* Header */}
      <div className="context-menu__header">
        <div className="context-menu__header-source">{alarm.sourceName}</div>
        <div className="context-menu__header-meta">
          {alarm.priority} · Sev {alarm.severity} · {alarm.state}
        </div>
      </div>

      {/* Menu Items */}
      <div className="context-menu__body">
        {menuItems.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && menuItems[i - 1]?.separator && (
              <div className="context-menu__separator" />
            )}
            <button
              className={`context-menu__item ${item.disabled ? 'context-menu__item--disabled' : ''} ${item.danger ? 'context-menu__item--danger' : ''}`}
              onMouseDown={(e) => {
                if (item.disabled) return;
                // Preemptively capture mousedown so the outside click handler doesn't close it first
                e.preventDefault();
                e.stopPropagation();
                item.onClick();
              }}
              onClick={(e) => {
                // Fallback for keyboard events (Enter/Space)
                if (item.disabled) return;
                item.onClick();
              }}
              disabled={item.disabled}
            >
              <span className="context-menu__item-icon">{item.icon}</span>
              <span className="context-menu__item-label">{item.label}</span>
              {item.shortcut && (
                <span className="context-menu__item-shortcut">{item.shortcut}</span>
              )}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
