import React from 'react';
import type { CanvasItem } from './types';
import { OBC, getNamurState, getValueColor, getPercentage, formatValue } from './openBridgeTheme';

export interface CustomSymbolContext {
  item: CanvasItem;
  mode: 'design' | 'preview';
  displayValue: string;
  numericValue: number;
  isRunning: boolean;
  isLoading: boolean;
  liveValue: unknown;
  statusValue: unknown;
  pvValue: unknown;
  spValue: unknown;
  decimals: number;
  unit?: string;
}

const NAMUR_COLORS: Record<string, { fill: string; label: string }> = {
  failure: { fill: OBC.alarm, label: 'Failure' },
  check: { fill: OBC.caution, label: 'Check' },
  maintenance: { fill: OBC.advisory, label: 'Maint' },
  good: { fill: OBC.running, label: 'Good' },
  unknown: { fill: OBC.textInactive, label: '--' },
};

export function renderCustomSymbol(type: string, ctx: CustomSymbolContext): React.ReactNode {
  const { item, mode, displayValue, numericValue, isRunning, isLoading, liveValue, statusValue, pvValue, spValue, decimals, unit } = ctx;
  const stroke = OBC.textNeutral;
  const fill = OBC.section;
  const text = OBC.textActive;
  const valueColor = getValueColor(numericValue, item.alarmLimits);
  const pct = mode === 'preview' ? getPercentage(numericValue) : 55;

  switch (type) {
    // ─── Indicators ───────────────────────────────────────────────────────
    case 'ind.gauge': {
      const angle = (pct / 100) * 270 - 135;
      return (
        <div className="symbol symbol-custom symbol-gauge">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <path d="M 15 80 A 45 45 0 1 1 85 80" fill="none" stroke={OBC.backdrop} strokeWidth="8" strokeLinecap="round" />
            <path
              d="M 15 80 A 45 45 0 1 1 85 80"
              fill="none"
              stroke={valueColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${pct * 2.1} 300`}
            />
            <line
              x1="50" y1="50" x2="50" y2="22"
              stroke={text}
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${angle} 50 50)`}
            />
            <circle cx="50" cy="50" r="4" fill={text} />
            <text x="50" y="72" textAnchor="middle" fill={valueColor} fontSize="11" fontWeight="600">
              {isLoading && mode === 'preview' ? '...' : displayValue}
            </text>
          </svg>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );
    }

    case 'ind.multistate': {
      const namur = getNamurState(mode === 'preview' ? statusValue ?? liveValue : undefined);
      const colors = NAMUR_COLORS[namur];
      return (
        <div className="symbol symbol-custom symbol-namur">
          <div className="symbol-namur__stack">
            {(['failure', 'check', 'maintenance', 'good'] as const).map(state => (
              <div
                key={state}
                className={`symbol-namur__light ${namur === state ? 'symbol-namur__light--active' : ''}`}
                style={{
                  backgroundColor: namur === state ? NAMUR_COLORS[state].fill : OBC.backdrop,
                  borderColor: NAMUR_COLORS[state].fill,
                }}
              />
            ))}
          </div>
          <div className="symbol-namur__status" style={{ color: colors.fill }}>{colors.label}</div>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );
    }

    case 'ind.digital':
      return (
        <div className="symbol symbol-custom symbol-digital">
          <div className="symbol-digital__face">
            {isLoading && mode === 'preview' ? '---' : displayValue}
          </div>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );

    case 'ind.setpoint':
      return (
        <div className="symbol symbol-custom symbol-setpoint">
          <div className="symbol-setpoint__row">
            <span className="symbol-setpoint__tag">PV</span>
            <span className="symbol-setpoint__val" style={{ color: valueColor }}>
              {mode === 'preview' && pvValue !== undefined ? formatValue(pvValue, decimals, unit) : '--'}
            </span>
          </div>
          <div className="symbol-setpoint__row">
            <span className="symbol-setpoint__tag">SP</span>
            <span className="symbol-setpoint__val symbol-setpoint__val--sp">
              {mode === 'preview' && spValue !== undefined ? formatValue(spValue, decimals, unit) : '--'}
            </span>
          </div>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );

    // ─── Equipment ────────────────────────────────────────────────────────
    case 'equip.heater':
      return (
        <div className={`symbol symbol-custom symbol-heater ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 60 80" width="100%" height="100%">
            <rect x="10" y="10" width="40" height="50" fill={fill} stroke={stroke} strokeWidth="2" rx="3" />
            {[20, 30, 40].map(x => (
              <path
                key={x}
                d={`M ${x} 62 Q ${x + 4} 48 ${x} 34 Q ${x - 4} 20 ${x} 18`}
                fill="none"
                stroke={isRunning ? OBC.warning : stroke}
                strokeWidth="2"
              />
            ))}
          </svg>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );

    case 'equip.cooler':
      return (
        <div className={`symbol symbol-custom symbol-cooler ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 60 80" width="100%" height="100%">
            <rect x="10" y="10" width="40" height="50" fill={fill} stroke={stroke} strokeWidth="2" rx="3" />
            <text x="30" y="44" textAnchor="middle" fontSize="18" fill={isRunning ? OBC.advisory : stroke}>❄</text>
          </svg>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );

    case 'equip.conveyor':
      return (
        <div className={`symbol symbol-custom symbol-conveyor ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 200 40" width="100%" height="100%">
            <rect x="5" y="12" width="190" height="16" fill={fill} stroke={stroke} strokeWidth="2" rx="8" />
            <circle cx="20" cy="20" r="7" fill={OBC.backdrop} stroke={stroke} strokeWidth="2" />
            <circle cx="180" cy="20" r="7" fill={OBC.backdrop} stroke={stroke} strokeWidth="2" />
            {isRunning && [50, 90, 130].map(x => (
              <rect key={x} x={x} y="16" width="12" height="8" fill={stroke} rx="1">
                <animate attributeName="x" from={x} to={x + 40} dur="1.2s" repeatCount="indefinite" />
              </rect>
            ))}
          </svg>
        </div>
      );

    case 'equip.agitator':
      return (
        <div className={`symbol symbol-custom symbol-agitator ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="30" y1="5" x2="30" y2="70" stroke={stroke} strokeWidth="3" />
            <g className={isRunning ? 'spinning' : ''} style={{ transformOrigin: '30px 75px' }}>
              <line x1="10" y1="75" x2="50" y2="75" stroke={isRunning ? OBC.running : stroke} strokeWidth="3" />
              <line x1="30" y1="60" x2="30" y2="90" stroke={isRunning ? OBC.running : stroke} strokeWidth="3" />
            </g>
          </svg>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );

    // ─── Piping ───────────────────────────────────────────────────────────
    case 'pipe.reducer':
      return (
        <div className="symbol symbol-custom symbol-pipe">
          <svg viewBox="0 0 50 20" width="100%" height="100%" preserveAspectRatio="none">
            <polygon points="0,2 35,2 50,10 35,18 0,18" fill={stroke} />
          </svg>
        </div>
      );

    // ─── Shapes ───────────────────────────────────────────────────────────
    case 'shape.label':
      return (
        <div
          className="symbol symbol-custom symbol-text"
          style={{
            display: 'flex', alignItems: 'center', width: '100%', height: '100%', overflow: 'hidden',
            whiteSpace: 'nowrap', fontFamily: 'var(--ams-font)',
            fontSize: (item.style?.fontSize as number) || 13,
            color: (item.style?.stroke as string) && item.style?.stroke !== 'none'
              ? (item.style?.stroke as string) : 'var(--ams-text, #e5e7eb)',
          }}
        >
          {item.label || ''}
        </div>
      );

    case 'shape.rect':
      return (
        <div className="symbol symbol-custom symbol-shape">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <rect
              x="2" y="2" width="96" height="96"
              fill={(item.style?.fill as string) || fill}
              stroke={(item.style?.stroke as string) || stroke}
              strokeWidth={item.style?.strokeWidth ?? 2}
              rx={item.style?.borderRadius ?? 4}
              opacity={item.style?.opacity ?? 1}
            />
          </svg>
        </div>
      );

    case 'shape.circle':
      return (
        <div className="symbol symbol-custom symbol-shape">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <ellipse
              cx="50" cy="50" rx="48" ry="48"
              fill={(item.style?.fill as string) || fill}
              stroke={(item.style?.stroke as string) || stroke}
              strokeWidth={item.style?.strokeWidth ?? 2}
              opacity={item.style?.opacity ?? 1}
            />
          </svg>
        </div>
      );

    case 'shape.line':
      return (
        <div className="symbol symbol-custom symbol-shape">
          <svg viewBox="0 0 100 4" width="100%" height="100%" preserveAspectRatio="none">
            <line
              x1="0" y1="2" x2="100" y2="2"
              stroke={(item.style?.stroke as string) || stroke}
              strokeWidth={item.style?.strokeWidth ?? 2}
            />
          </svg>
        </div>
      );

    case 'shape.divider':
      return (
        <div className="symbol symbol-custom symbol-divider">
          <div className="symbol-divider__line" />
        </div>
      );

    // ─── Controls ─────────────────────────────────────────────────────────
    case 'ctrl.selector': {
      const pos = mode === 'preview' && typeof liveValue === 'number' ? Math.round(liveValue) % 3 : 0;
      const labels = ['A', 'B', 'C'];
      return (
        <div className="symbol symbol-custom symbol-selector">
          <div className="symbol-selector__dial">
            {labels.map((l, i) => (
              <div
                key={l}
                className={`symbol-selector__pos ${pos === i ? 'symbol-selector__pos--active' : ''}`}
              >
                {l}
              </div>
            ))}
          </div>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );
    }

    // ─── Alarms ───────────────────────────────────────────────────────────
    case 'alarm.beacon':
      return (
        <div className={`symbol symbol-custom symbol-beacon ${statusValue ? 'symbol-beacon--active' : ''}`}>
          <svg viewBox="0 0 40 40" width="100%" height="100%">
            <circle
              cx="20" cy="20" r="14"
              fill={statusValue ? OBC.alarm : OBC.textInactive}
              stroke={OBC.border}
              strokeWidth="2"
            >
              {!!statusValue && mode === 'preview' && (
                <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />
              )}
            </circle>
          </svg>
        </div>
      );

    case 'alarm.horn':
      return (
        <div className={`symbol symbol-custom symbol-horn ${statusValue ? 'symbol-horn--active' : ''}`}>
          <svg viewBox="0 0 50 50" width="100%" height="100%">
            <path
              d="M 8 20 L 22 20 L 38 8 L 38 42 L 22 30 L 8 30 Z"
              fill={statusValue ? OBC.alarmBg : fill}
              stroke={statusValue ? OBC.alarm : stroke}
              strokeWidth="2"
            />
            <line x1="40" y1="18" x2="46" y2="14" stroke={statusValue ? OBC.alarm : stroke} strokeWidth="2" />
            <line x1="40" y1="32" x2="46" y2="36" stroke={statusValue ? OBC.alarm : stroke} strokeWidth="2" />
          </svg>
        </div>
      );

    case 'alarm.summary':
      return (
        <div className="symbol symbol-custom symbol-alarm-summary">
          <div className="symbol-alarm-summary__header">Alarms</div>
          <div className="symbol-alarm-summary__row symbol-alarm-summary__row--alarm">
            <span>Critical</span><span>{mode === 'preview' ? '2' : '-'}</span>
          </div>
          <div className="symbol-alarm-summary__row symbol-alarm-summary__row--warning">
            <span>Warning</span><span>{mode === 'preview' ? '5' : '-'}</span>
          </div>
          <div className="symbol-alarm-summary__row">
            <span>Unacked</span><span>{mode === 'preview' ? '3' : '-'}</span>
          </div>
        </div>
      );

    // ─── Charts ───────────────────────────────────────────────────────────
    case 'chart.bar':
      return (
        <div className="symbol symbol-custom symbol-chart-bar">
          <div className="symbol-chart-bar__header">{item.label || 'Bar Chart'}</div>
          <svg viewBox="0 0 100 60" width="100%" height="100%" preserveAspectRatio="none">
            {[15, 35, 25, 50, 40, 30].map((h, i) => (
              <rect
                key={i}
                x={8 + i * 15}
                y={60 - h}
                width="10"
                height={h}
                fill={OBC.advisory}
                opacity="0.85"
              />
            ))}
          </svg>
        </div>
      );

    case 'chart.xy':
      return (
        <div className="symbol symbol-custom symbol-chart-xy">
          <div className="symbol-chart-xy__header">{item.label || 'XY Plot'}</div>
          <svg viewBox="0 0 100 60" width="100%" height="100%">
            <line x1="10" y1="55" x2="95" y2="55" stroke={stroke} strokeWidth="1" />
            <line x1="10" y1="5" x2="10" y2="55" stroke={stroke} strokeWidth="1" />
            {[[20,45],[35,30],[50,35],[65,20],[80,25]].map(([x,y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill={OBC.advisory} />
            ))}
          </svg>
        </div>
      );

    case 'chart.pie':
      return (
        <div className="symbol symbol-custom symbol-chart-pie">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <circle cx="50" cy="50" r="40" fill={OBC.backdrop} stroke={stroke} strokeWidth="1" />
            <path d="M 50 50 L 50 10 A 40 40 0 0 1 88 62 Z" fill={OBC.advisory} opacity="0.9" />
            <path d="M 50 50 L 88 62 A 40 40 0 0 1 20 75 Z" fill={stroke} opacity="0.6" />
            <path d="M 50 50 L 20 75 A 40 40 0 0 1 50 10 Z" fill={OBC.textInactive} opacity="0.5" />
          </svg>
          {item.label && <div className="symbol-custom__label">{item.label}</div>}
        </div>
      );

    default:
      return null;
  }
}

/** Types handled by CustomSymbols – used by SymbolRenderer default branch */
export const CUSTOM_SYMBOL_TYPES = new Set([
  'ind.gauge', 'ind.multistate', 'ind.digital', 'ind.setpoint',
  'equip.heater', 'equip.cooler', 'equip.conveyor', 'equip.agitator',
  'pipe.reducer',
  'shape.rect', 'shape.circle', 'shape.line', 'shape.divider', 'shape.label',
  'ctrl.selector',
  'alarm.beacon', 'alarm.horn', 'alarm.summary',
  'chart.bar', 'chart.xy', 'chart.pie',
]);
