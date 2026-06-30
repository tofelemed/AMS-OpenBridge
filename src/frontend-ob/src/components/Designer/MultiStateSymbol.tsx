import React from 'react';

/**
 * NAMUR NE107 Status States and Colors
 * 
 * Standard status colors for industrial HMI symbols:
 * - Good: Normal operation (green)
 * - Uncertain: Degraded but functional (yellow/orange)  
 * - Bad: Failure or critical (red)
 * - Maintenance Required: Service needed (blue)
 * - Out of Service: Disabled/offline (gray)
 */
export enum NamurStatus {
  Good = 'good',
  Uncertain = 'uncertain',
  Bad = 'bad',
  MaintenanceRequired = 'maintenance',
  OutOfService = 'outOfService',
  Unknown = 'unknown'
}

export const NAMUR_COLORS: Record<NamurStatus, { fill: string; stroke: string; text: string; bg: string }> = {
  [NamurStatus.Good]: {
    fill: '#22c55e',
    stroke: '#16a34a',
    text: '#ffffff',
    bg: 'rgba(34, 197, 94, 0.15)'
  },
  [NamurStatus.Uncertain]: {
    fill: '#f59e0b',
    stroke: '#d97706',
    text: '#000000',
    bg: 'rgba(245, 158, 11, 0.15)'
  },
  [NamurStatus.Bad]: {
    fill: '#ef4444',
    stroke: '#dc2626',
    text: '#ffffff',
    bg: 'rgba(239, 68, 68, 0.15)'
  },
  [NamurStatus.MaintenanceRequired]: {
    fill: '#3b82f6',
    stroke: '#2563eb',
    text: '#ffffff',
    bg: 'rgba(59, 130, 246, 0.15)'
  },
  [NamurStatus.OutOfService]: {
    fill: '#6b7280',
    stroke: '#4b5563',
    text: '#ffffff',
    bg: 'rgba(107, 114, 128, 0.15)'
  },
  [NamurStatus.Unknown]: {
    fill: '#9ca3af',
    stroke: '#6b7280',
    text: '#000000',
    bg: 'rgba(156, 163, 175, 0.15)'
  }
};

/**
 * Derives NAMUR status from a numeric value or status code.
 */
export function deriveNamurStatus(value: unknown): NamurStatus {
  if (value === null || value === undefined) {
    return NamurStatus.Unknown;
  }
  
  // Boolean status
  if (typeof value === 'boolean') {
    return value ? NamurStatus.Good : NamurStatus.OutOfService;
  }
  
  // Numeric status codes (common convention)
  if (typeof value === 'number') {
    if (value === 0) return NamurStatus.OutOfService;
    if (value === 1) return NamurStatus.Good;
    if (value === 2) return NamurStatus.Uncertain;
    if (value === 3) return NamurStatus.Bad;
    if (value === 4) return NamurStatus.MaintenanceRequired;
    return NamurStatus.Unknown;
  }
  
  // String status
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['running', 'on', 'active', 'good', 'normal', 'ok'].includes(lower)) {
      return NamurStatus.Good;
    }
    if (['stopped', 'off', 'inactive', 'idle'].includes(lower)) {
      return NamurStatus.OutOfService;
    }
    if (['warning', 'degraded', 'uncertain'].includes(lower)) {
      return NamurStatus.Uncertain;
    }
    if (['alarm', 'fault', 'error', 'bad', 'critical'].includes(lower)) {
      return NamurStatus.Bad;
    }
    if (['maintenance', 'service'].includes(lower)) {
      return NamurStatus.MaintenanceRequired;
    }
  }
  
  return NamurStatus.Unknown;
}

interface MultiStateIndicatorProps {
  status: NamurStatus;
  label?: string;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
}

/**
 * Multi-state status indicator with NAMUR NE107 colors.
 */
export const MultiStateIndicator: React.FC<MultiStateIndicatorProps> = ({
  status,
  label,
  showLabel = true,
  size = 'medium',
  animated = true
}) => {
  const colors = NAMUR_COLORS[status];
  const sizeMap = { small: 12, medium: 16, large: 24 };
  const indicatorSize = sizeMap[size];
  
  return (
    <div className="multistate-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        className={`multistate-dot ${animated && status === NamurStatus.Bad ? 'multistate-dot--pulsing' : ''}`}
        style={{
          width: indicatorSize,
          height: indicatorSize,
          borderRadius: '50%',
          backgroundColor: colors.fill,
          border: `2px solid ${colors.stroke}`,
          boxShadow: `0 0 ${indicatorSize / 2}px ${colors.fill}40`
        }}
      />
      {showLabel && label && (
        <span className="multistate-label" style={{ fontSize: size === 'small' ? '11px' : '13px' }}>
          {label}
        </span>
      )}
    </div>
  );
};

interface MultiStateEquipmentProps {
  status: NamurStatus;
  equipmentType: 'pump' | 'valve' | 'motor' | 'vessel';
  label?: string;
  size?: { width: number; height: number };
  animated?: boolean;
}

/**
 * Equipment symbol with NAMUR NE107 multi-state coloring.
 */
export const MultiStateEquipment: React.FC<MultiStateEquipmentProps> = ({
  status,
  equipmentType,
  label,
  size = { width: 80, height: 80 },
  animated = true
}) => {
  const colors = NAMUR_COLORS[status];
  const isAnimated = animated && status === NamurStatus.Good;
  
  const renderSymbol = () => {
    switch (equipmentType) {
      case 'pump':
        return (
          <svg viewBox="0 0 80 80" width={size.width} height={size.height}>
            <circle
              cx="40" cy="40" r="28"
              fill={colors.bg}
              stroke={colors.stroke}
              strokeWidth="3"
            />
            <circle
              cx="40" cy="40" r="18"
              fill="none"
              stroke={colors.stroke}
              strokeWidth="2"
            />
            <line x1="40" y1="12" x2="40" y2="22" stroke={colors.stroke} strokeWidth="3" />
            <line x1="40" y1="58" x2="40" y2="68" stroke={colors.stroke} strokeWidth="3" />
            {isAnimated && (
              <circle cx="40" cy="40" r="8" fill={colors.fill}>
                <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.6;1" dur="1s" repeatCount="indefinite" />
              </circle>
            )}
            {status === NamurStatus.Bad && (
              <text x="40" y="45" textAnchor="middle" fill={colors.fill} fontSize="24" fontWeight="bold">!</text>
            )}
          </svg>
        );
      
      case 'valve':
        return (
          <svg viewBox="0 0 80 80" width={size.width} height={size.height}>
            <polygon
              points="10,20 40,50 10,80"
              fill={colors.bg}
              stroke={colors.stroke}
              strokeWidth="2"
            />
            <polygon
              points="70,20 40,50 70,80"
              fill={colors.bg}
              stroke={colors.stroke}
              strokeWidth="2"
            />
            <line x1="40" y1="50" x2="40" y2="10" stroke={colors.stroke} strokeWidth="3" />
            <rect x="30" y="5" width="20" height="10" fill={colors.fill} stroke={colors.stroke} strokeWidth="1" />
          </svg>
        );
      
      case 'motor':
        return (
          <svg viewBox="0 0 80 80" width={size.width} height={size.height}>
            <circle
              cx="40" cy="40" r="30"
              fill={colors.bg}
              stroke={colors.stroke}
              strokeWidth="3"
            />
            <text
              x="40" y="48"
              textAnchor="middle"
              fill={colors.fill}
              fontSize="28"
              fontWeight="bold"
            >
              M
            </text>
            {isAnimated && (
              <circle cx="40" cy="40" r="30" fill="none" stroke={colors.fill} strokeWidth="2" opacity="0.5">
                <animate attributeName="r" values="30;35;30" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
        );
      
      case 'vessel':
        return (
          <svg viewBox="0 0 80 100" width={size.width} height={size.height}>
            <path
              d="M 15 20 L 15 70 Q 15 90 40 90 Q 65 90 65 70 L 65 20 Q 65 10 40 10 Q 15 10 15 20"
              fill={colors.bg}
              stroke={colors.stroke}
              strokeWidth="3"
            />
            <ellipse cx="40" cy="20" rx="25" ry="10" fill={colors.bg} stroke={colors.stroke} strokeWidth="2" />
          </svg>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="multistate-equipment">
      {renderSymbol()}
      {label && (
        <div
          className="multistate-equipment__label"
          style={{
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 600,
            color: colors.stroke,
            marginTop: '4px'
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export default MultiStateIndicator;
