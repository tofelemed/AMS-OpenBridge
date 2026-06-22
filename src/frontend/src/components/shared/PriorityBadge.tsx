import React from 'react';

interface PriorityBadgeProps {
  priority: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  const getStyle = () => {
    switch (priority?.toUpperCase()) {
      case 'CRITICAL':
        return {
          background: 'rgba(255, 23, 68, 0.15)',
          color: 'var(--alarm-critical, #ff1744)',
          border: '1px solid rgba(255, 23, 68, 0.3)',
        };
      case 'HIGH':
        return {
          background: 'rgba(255, 145, 0, 0.15)',
          color: 'var(--alarm-high, #ff9100)',
          border: '1px solid rgba(255, 145, 0, 0.3)',
        };
      case 'MEDIUM':
        return {
          background: 'rgba(255, 235, 59, 0.1)',
          color: 'var(--alarm-medium, #ffeb3b)',
          border: '1px solid rgba(255, 235, 59, 0.25)',
        };
      case 'LOW':
        return {
          background: 'rgba(33, 150, 243, 0.15)',
          color: 'var(--alarm-low, #2196f3)',
          border: '1px solid rgba(33, 150, 243, 0.3)',
        };
      default:
        return {
          background: 'rgba(158, 158, 158, 0.15)',
          color: 'var(--text-secondary, #9e9e9e)',
          border: '1px solid rgba(158, 158, 158, 0.3)',
        };
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 700,
        borderRadius: '4px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        ...getStyle(),
      }}
    >
      {priority}
    </span>
  );
};
