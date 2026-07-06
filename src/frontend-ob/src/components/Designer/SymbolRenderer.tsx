import React from 'react';
import type { CanvasItem } from './types';
import { useBindingResolver } from '../../hooks/useBindingResolver';
import type { LiveMetric } from '../../store/mqttStore';
import { renderCustomSymbol, CUSTOM_SYMBOL_TYPES } from './CustomSymbols';
import { getValueColor, formatValue as fmtValue, getPercentage as pctValue, isStale } from './openBridgeTheme';
import { isLazyObcType } from './lazyCategoryRegistry';
import { LazyObcSymbol } from './LazyObcSymbol';
import { TrendChart } from './TrendChart';

// OpenBridge Web Components (ISA-101 compliant)
import { ObcStatusIndicator } from '@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator';
import { ObcProgressBar } from '@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar';
import { ObcSlider } from '@oicl/openbridge-webcomponents-react/components/slider/slider';
import { ObcToggleSwitch } from '@oicl/openbridge-webcomponents-react/components/toggle-switch/toggle-switch';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcBadge } from '@oicl/openbridge-webcomponents-react/components/badge/badge';
import { ObcCard } from '@oicl/openbridge-webcomponents-react/components/card/card';
import { ObcClock } from '@oicl/openbridge-webcomponents-react/components/clock/clock';
import { ObcBreadcrumb } from '@oicl/openbridge-webcomponents-react/components/breadcrumb/breadcrumb';
import { ObcAlertIcon } from '@oicl/openbridge-webcomponents-react/components/alert-icon/alert-icon';

interface SymbolRendererProps {
  item: CanvasItem;
  mode: 'design' | 'preview';
}

// ISA-101 / NAMUR NE107: Map value to OpenBridge status indicator state
function getStatusIndicatorState(value: unknown, limits?: CanvasItem['alarmLimits']): 'active' | 'inactive' | 'caution' | 'warning' | 'alarm' | 'running' {
  if (value === undefined || value === null) return 'inactive';
  if (typeof value === 'boolean') return value ? 'running' : 'inactive';
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'running' || lower === 'on' || lower === 'active') return 'running';
    if (lower === 'alarm' || lower === 'critical') return 'alarm';
    if (lower === 'warning' || lower === 'high') return 'warning';
    if (lower === 'caution' || lower === 'low') return 'caution';
    return 'inactive';
  }
  if (typeof value === 'number' && limits) {
    if (limits.hiHi !== undefined && value >= limits.hiHi) return 'alarm';
    if (limits.loLo !== undefined && value <= limits.loLo) return 'alarm';
    if (limits.hi !== undefined && value >= limits.hi) return 'warning';
    if (limits.lo !== undefined && value <= limits.lo) return 'caution';
    return 'active';
  }
  return value ? 'active' : 'inactive';
}

// ISA-101: Get alarm color (grayscale by default, color only for abnormal)
function getAlarmColor(value: number, limits?: CanvasItem['alarmLimits']): string {
  return getValueColor(value, limits);
}

// Every binding slot a symbol can declare. Resolved generically (not just value/
// status/pv/sp) so a tank bound on `level`, a pump on `speed`, a valve on `position`
// all receive live data. Fixed, constant order → stable hook order (see useSlotMetrics).
const KNOWN_SLOTS = [
  'value', 'pv', 'sp', 'status', 'state', 'running',
  'level', 'speed', 'position', 'position2', 'temperature', 'current',
  'pressure', 'flow', 'setpoint', 'command', 'text',
] as const;

// Which slot supplies the symbol's "primary" scalar when `value` isn't bound.
const PRIMARY_VALUE_SLOTS = [
  'value', 'pv', 'level', 'speed', 'position', 'pressure',
  'temperature', 'current', 'flow', 'setpoint', 'sp',
] as const;

/** Resolve live metrics for every declared slot. Fixed-length loop keeps hook order stable. */
function useSlotMetrics(item: CanvasItem, mode: 'design' | 'preview'): Record<string, LiveMetric | undefined> {
  const enabled = mode === 'preview';
  const out: Record<string, LiveMetric | undefined> = {};
  for (const slot of KNOWN_SLOTS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- constant-length loop; hook order is stable
    const { metric } = useBindingResolver(enabled ? item.bindings?.[slot] : undefined, 'live');
    out[slot] = metric;
  }
  return out;
}

/** NE107: wrap a symbol so stale (no-update) live data is visibly degraded. */
const SymbolQualityWrap: React.FC<{ stale: boolean; children: React.ReactNode }> = ({ stale, children }) => {
  if (!stale) return <>{children}</>;
  return (
    <div
      className="symbol-quality-stale"
      title="Stale data (NE107): no update received"
      style={{ position: 'relative', width: '100%', height: '100%', filter: 'grayscale(1)', opacity: 0.5 }}
    >
      {children}
      <span
        aria-label="stale"
        style={{
          position: 'absolute', top: 0, right: 0, fontSize: 10, lineHeight: 1, padding: '1px 3px',
          borderRadius: 3, background: 'var(--element-disabled-color, #535353)',
          color: 'var(--container-background-color, #1f1f1f)', filter: 'grayscale(0)', opacity: 1,
        }}
      >
        ⚠
      </span>
    </div>
  );
};

export const SymbolRenderer: React.FC<SymbolRendererProps> = ({ item, mode }) => {
  // Generic multi-slot live binding — resolve every declared slot, not only value/status/pv/sp.
  const slots = useSlotMetrics(item, mode);

  const statusMetric = slots.status ?? slots.state ?? slots.running;
  const statusValue = statusMetric?.value;
  const pvValue = slots.pv?.value;
  const spValue = slots.sp?.value;

  // Primary scalar: first received slot in priority order → any bound symbol shows live data.
  const primarySlot = PRIMARY_VALUE_SLOTS.find(s => slots[s] !== undefined);
  const primaryMetric = primarySlot ? slots[primarySlot] : undefined;
  const liveValue = primaryMetric?.value;
  const isLoading = mode === 'preview' && !!(primarySlot && item.bindings?.[primarySlot]) && liveValue === undefined;

  const numericValue = typeof liveValue === 'number' ? liveValue : 0;
  const decimals = item.formatting?.decimals ?? 1;
  const unit = item.formatting?.unit;
  const isRunning = statusValue === true || statusValue === 1 || statusValue === 'Running' || statusValue === 'ON';

  const displayValue = mode === 'preview' && liveValue !== undefined
    ? fmtValue(liveValue, decimals, item.formatting?.showUnit !== false ? unit : undefined)
    : (primarySlot && item.bindings?.[primarySlot])
      ? `{${item.bindings[primarySlot]!.split('/').pop()}}`
      : '--';

  const statusState = getStatusIndicatorState(
    mode === 'preview' ? (statusValue ?? liveValue) : undefined,
    item.alarmLimits
  );

  // NE107 staleness: a slot that stopped updating renders degraded (see wrapper at return).
  const stale = mode === 'preview' && primaryMetric !== undefined && isStale(primaryMetric.ts);

  const renderInner = (): React.ReactNode => {
  // OpenBridge components — lazy-loaded renderer chunks per domain
  if (isLazyObcType(item.type)) {
    return (
      <LazyObcSymbol
        item={item}
        mode={mode}
        isRunning={isRunning}
        numericValue={numericValue}
        liveValue={liveValue}
        statusValue={statusValue}
        displayValue={displayValue}
        statusState={statusState}
      />
    );
  }

  // Custom SVG symbols (OpenBridge themed, not in OBC library)
  if (CUSTOM_SYMBOL_TYPES.has(item.type)) {
    return (
      <>
        {renderCustomSymbol(item.type, {
          item,
          mode,
          displayValue,
          numericValue,
          isRunning,
          isLoading,
          liveValue,
          statusValue,
          pvValue,
          spValue,
          decimals,
          unit,
        })}
      </>
    );
  }
  
  switch (item.type) {
    // ─────────────────────────────────────────────────────────────────────────
    // OPENBRIDGE INDICATORS (ISA-101)
    // ─────────────────────────────────────────────────────────────────────────
    case 'obc.readout':
    case 'obc.readout-unit':
      return (
        <div className="symbol symbol-readout">
          {item.label && <div className="symbol-readout__label">{item.label}</div>}
          <div className="symbol-readout__value" style={{ color: getAlarmColor(numericValue, item.alarmLimits) }}>
            {isLoading && mode === 'preview' ? '...' : displayValue}
          </div>
        </div>
      );
    
    case 'obc.status':
      return (
        <ObcStatusIndicator status={statusState}>
          {item.label || 'Status'}
        </ObcStatusIndicator>
      );
    
    case 'obc.bar':
      const barPercent = mode === 'preview' ? pctValue(numericValue) : 60;
      return (
        <div className="symbol symbol-bar-vertical">
          <ObcProgressBar 
            value={barPercent}
            style={{ 
              transform: 'rotate(-90deg)', 
              width: item.size.height,
              '--progress-bar-color': getAlarmColor(numericValue, item.alarmLimits)
            } as React.CSSProperties}
          />
          {item.label && <div className="symbol-bar__label">{item.label}</div>}
        </div>
      );
    
    case 'obc.bar-horizontal':
      const hBarPercent = mode === 'preview' ? pctValue(numericValue) : 60;
      return (
        <div className="symbol symbol-bar-horizontal">
          {item.label && <div className="symbol-bar__label">{item.label}</div>}
          <ObcProgressBar 
            value={hBarPercent}
            style={{ '--progress-bar-color': getAlarmColor(numericValue, item.alarmLimits) } as React.CSSProperties}
          />
        </div>
      );
    
    case 'obc.badge':
      return (
        <ObcBadge>
          {item.label || (mode === 'preview' ? String(liveValue || '--') : '{tag}')}
        </ObcBadge>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // OPENBRIDGE CONTROLS (ISA-101)
    // ─────────────────────────────────────────────────────────────────────────
    case 'obc.button':
      return (
        <ObcButton variant="normal">
          {item.label || 'Command'}
        </ObcButton>
      );
    
    case 'obc.toggle':
      return (
        <div className="symbol symbol-toggle">
          <ObcToggleSwitch checked={isRunning} />
          {item.label && <span className="symbol-toggle__label">{item.label}</span>}
        </div>
      );
    
    case 'obc.slider':
      return (
        <div className="symbol symbol-slider-vertical">
          <ObcSlider 
            value={mode === 'preview' ? numericValue : 50}
            min={0}
            max={100}
          />
          <div className="symbol-slider__value">{displayValue}</div>
        </div>
      );
    
    case 'obc.slider-horizontal':
      return (
        <div className="symbol symbol-slider-horizontal">
          {item.label && <div className="symbol-slider__label">{item.label}</div>}
          <ObcSlider 
            value={mode === 'preview' ? numericValue : 50}
            min={0}
            max={100}
          />
        </div>
      );
    
    case 'obc.input':
      return (
        <div className="symbol symbol-input">
          {item.label && <div className="symbol-input__label">{item.label}</div>}
          <input
            type="text"
            className="symbol-input__field"
            value={mode === 'preview' ? displayValue : ''}
            readOnly={mode === 'preview'}
            placeholder="0.0"
          />
        </div>
      );
    
    case 'obc.check':
      return (
        <div className="symbol symbol-check">
          <input type="checkbox" checked={isRunning} readOnly />
          <span>{item.label || 'Option'}</span>
        </div>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // OPENBRIDGE LAYOUT
    // ─────────────────────────────────────────────────────────────────────────
    case 'obc.card':
    case 'obc.elevated-card':
      return (
        <ObcCard>
          <div className="symbol-card__content">
            {item.label || 'Card'}
          </div>
        </ObcCard>
      );
    
    case 'obc.clock':
      return <ObcClock />;
    
    case 'obc.breadcrumb':
      return (
        <ObcBreadcrumb 
          items={[
            { label: 'Site', href: '#' },
            { label: 'Area', href: '#' },
            { label: item.label || 'Current' }
          ]}
        />
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // OPENBRIDGE ALARMS (ISA-18.2)
    // ─────────────────────────────────────────────────────────────────────────
    case 'obc.alert-icon':
      return (
        <ObcAlertIcon 
          alert-type={statusState === 'alarm' ? 'alarm' : statusState === 'warning' ? 'warning' : 'caution'}
        />
      );
    
    case 'obc.alert-button':
      return (
        <ObcButton variant="flat">
          🔔 {item.label || 'Alarms'}
        </ObcButton>
      );
    
    case 'obc.nav-item':
      return (
        <ObcButton variant="normal">
          {item.label || 'Navigate'} →
        </ObcButton>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // ISA-5.1 EQUIPMENT SYMBOLS (SVG - grayscale by default)
    // ─────────────────────────────────────────────────────────────────────────
    case 'equip.pump':
      return (
        <div className={`symbol symbol-pump ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 80 80" width="100%" height="100%">
            <circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <polygon points="40,15 55,35 40,30 25,35" fill="currentColor">
              {isRunning && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 40 40"
                  to="360 40 40"
                  dur="1s"
                  repeatCount="indefinite"
                />
              )}
            </polygon>
            <line x1="40" y1="68" x2="40" y2="80" stroke="currentColor" strokeWidth="2.5" />
            <line x1="0" y1="40" x2="12" y2="40" stroke="currentColor" strokeWidth="2.5" />
            <line x1="68" y1="40" x2="80" y2="40" stroke="currentColor" strokeWidth="2.5" />
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    case 'equip.valve':
      const valvePosition = mode === 'preview' && typeof liveValue === 'number' ? liveValue : 50;
      return (
        <div className={`symbol symbol-valve ${isRunning ? 'symbol--open' : ''}`}>
          <svg viewBox="0 0 60 80" width="100%" height="100%">
            <polygon points="5,20 30,45 5,70" fill="none" stroke="currentColor" strokeWidth="2" />
            <polygon points="55,20 30,45 55,70" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="30" y1="45" x2="30" y2="8" stroke="currentColor" strokeWidth="2" />
            <rect x="20" y="2" width="20" height="8" fill="currentColor" rx="2" />
            <text x="30" y="78" textAnchor="middle" fontSize="10" fill="currentColor">
              {valvePosition}%
            </text>
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    case 'equip.valve-onoff':
      return (
        <div className={`symbol symbol-valve-onoff ${isRunning ? 'symbol--open' : ''}`}>
          <svg viewBox="0 0 50 50" width="100%" height="100%">
            <polygon points="5,10 25,25 5,40" fill="none" stroke="currentColor" strokeWidth="2" />
            <polygon points="45,10 25,25 45,40" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="18" y="2" width="14" height="6" fill="currentColor" rx="1" />
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    case 'equip.motor':
      return (
        <div className={`symbol symbol-motor ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 70 70" width="100%" height="100%">
            <circle cx="35" cy="35" r="28" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <text x="35" y="43" textAnchor="middle" fontSize="24" fill="currentColor">M</text>
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    case 'equip.tank':
      const tankLevel = mode === 'preview' && typeof liveValue === 'number' ? liveValue : 65;
      const tankPercent = Math.max(0, Math.min(100, tankLevel));
      return (
        <div className="symbol symbol-tank">
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <path
              d="M 8 15 Q 8 5 30 5 Q 52 5 52 15 L 52 85 Q 52 95 30 95 Q 8 95 8 85 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <clipPath id={`tank-clip-${item.id}`}>
              <path d="M 8 15 Q 8 5 30 5 Q 52 5 52 15 L 52 85 Q 52 95 30 95 Q 8 95 8 85 Z" />
            </clipPath>
            <rect
              x="8" y={95 - tankPercent * 0.9}
              width="44" height={tankPercent * 0.9}
              fill={getAlarmColor(tankPercent, item.alarmLimits)}
              opacity="0.5"
              clipPath={`url(#tank-clip-${item.id})`}
            />
            <text x="30" y="55" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="bold">
              {tankPercent.toFixed(0)}%
            </text>
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    case 'equip.hx':
      return (
        <div className="symbol symbol-hx">
          <svg viewBox="0 0 100 60" width="100%" height="100%">
            <ellipse cx="50" cy="30" rx="45" ry="25" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="5" y1="30" x2="95" y2="30" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    case 'equip.compressor':
      return (
        <div className={`symbol symbol-compressor ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 80 80" width="100%" height="100%">
            <polygon points="10,60 40,10 70,60" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="0" y1="40" x2="10" y2="40" stroke="currentColor" strokeWidth="2" />
            <line x1="70" y1="40" x2="80" y2="40" stroke="currentColor" strokeWidth="2" />
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    case 'equip.fan':
      return (
        <div className={`symbol symbol-fan ${isRunning ? 'symbol--running' : ''}`}>
          <svg viewBox="0 0 70 70" width="100%" height="100%">
            <circle cx="35" cy="35" r="28" fill="none" stroke="currentColor" strokeWidth="2" />
            <g className={isRunning ? 'spinning' : ''} style={{ transformOrigin: '35px 35px' }}>
              {[0, 90, 180, 270].map(angle => (
                <ellipse
                  key={angle}
                  cx="35" cy="20"
                  rx="6" ry="12"
                  fill="currentColor"
                  transform={`rotate(${angle} 35 35)`}
                />
              ))}
            </g>
            <circle cx="35" cy="35" r="6" fill="var(--container-background-color, #1e293b)" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {item.label && <div className="symbol-equipment__label">{item.label}</div>}
        </div>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // ISA-5.1 INSTRUMENT SYMBOLS (Circle with function letter)
    // ─────────────────────────────────────────────────────────────────────────
    case 'inst.ti':
    case 'inst.pi':
    case 'inst.fi':
    case 'inst.li':
    case 'inst.ai':
    case 'inst.tt':
      const instLetter = item.type.split('.')[1].toUpperCase();
      return (
        <div className="symbol symbol-instrument">
          <svg viewBox="0 0 50 50" width="100%" height="100%">
            <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="5" y1="25" x2="45" y2="25" stroke="currentColor" strokeWidth="1" />
            <text x="25" y="22" textAnchor="middle" fontSize="12" fill="currentColor">{instLetter}</text>
            <text x="25" y="36" textAnchor="middle" fontSize="9" fill="currentColor">
              {mode === 'preview' ? fmtValue(liveValue, decimals) : '---'}
            </text>
          </svg>
        </div>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // PIPING (ISA-101 grayscale)
    // ─────────────────────────────────────────────────────────────────────────
    case 'pipe.horizontal':
      return (
        <div className="symbol symbol-pipe">
          <svg viewBox="0 0 100 6" width="100%" height="100%" preserveAspectRatio="none">
            <rect x="0" y="0" width="100" height="6" fill="var(--on-container-muted-color, #64748b)" />
          </svg>
        </div>
      );
    
    case 'pipe.vertical':
      return (
        <div className="symbol symbol-pipe">
          <svg viewBox="0 0 6 100" width="100%" height="100%" preserveAspectRatio="none">
            <rect x="0" y="0" width="6" height="100" fill="var(--on-container-muted-color, #64748b)" />
          </svg>
        </div>
      );
    
    case 'pipe.elbow':
      return (
        <div className="symbol symbol-pipe">
          <svg viewBox="0 0 30 30" width="100%" height="100%">
            <path d="M 0,3 L 15,3 Q 27,3 27,15 L 27,30" fill="none" stroke="var(--on-container-muted-color, #64748b)" strokeWidth="6" />
          </svg>
        </div>
      );
    
    case 'pipe.tee':
      return (
        <div className="symbol symbol-pipe">
          <svg viewBox="0 0 40 40" width="100%" height="100%">
            <line x1="0" y1="20" x2="40" y2="20" stroke="var(--on-container-muted-color, #64748b)" strokeWidth="6" />
            <line x1="20" y1="20" x2="20" y2="40" stroke="var(--on-container-muted-color, #64748b)" strokeWidth="6" />
          </svg>
        </div>
      );
    
    case 'flow.arrow':
      return (
        <div className="symbol symbol-flow-arrow">
          <svg viewBox="0 0 30 16" width="100%" height="100%">
            <polygon points="0,4 20,4 20,0 30,8 20,16 20,12 0,12" fill="var(--alert-advisory-border-color, #3b82f6)" />
          </svg>
        </div>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // TEXT & LABELS
    // ─────────────────────────────────────────────────────────────────────────
    case 'text.label':
      return (
        <div className="symbol symbol-label" style={{
          fontSize: item.style?.fontSize || 14,
          fontWeight: item.style?.fontWeight,
          textAlign: item.style?.textAlign,
        }}>
          {item.label || 'Label'}
        </div>
      );
    
    case 'text.title':
      return (
        <div className="symbol symbol-title" style={{
          fontSize: item.style?.fontSize || 18,
          fontWeight: 'bold',
        }}>
          {item.label || 'Section Title'}
        </div>
      );
    
    case 'text.dynamic':
      return (
        <div className="symbol symbol-dynamic-text">
          {mode === 'preview' ? String(liveValue || '--') : `{${item.bindings?.text || 'text'}}`}
        </div>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // ALARMS & ALERTS
    // ─────────────────────────────────────────────────────────────────────────
    case 'alarm.banner':
      return (
        <div className={`symbol symbol-alarm-banner ${statusState === 'alarm' ? 'symbol-alarm-banner--alarm' : ''}`}>
          <span className="symbol-alarm-banner__icon">🚨</span>
          <span className="symbol-alarm-banner__text">
            {mode === 'preview' ? 'High Temperature - Tank T-101' : 'Alarm Banner'}
          </span>
        </div>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // TRENDS
    // ─────────────────────────────────────────────────────────────────────────
    case 'chart.trend':
      return (
        <div className="symbol symbol-trend">
          {item.label && <div className="symbol-trend__header">{item.label}</div>}
          <div className="symbol-trend__chart">
            <TrendChart item={item} mode={mode} />
          </div>
        </div>
      );
    
    case 'chart.sparkline':
      return (
        <div className="symbol symbol-sparkline">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" width="100%" height="100%">
            <polyline
              points="0,20 15,18 30,22 45,15 60,20 75,12 90,18 100,10"
              fill="none"
              stroke="var(--alert-advisory-border-color, #3b82f6)"
              strokeWidth="2"
            />
          </svg>
        </div>
      );
    
    case 'nav.faceplate':
      return (
        <div className="symbol symbol-faceplate-link">
          <svg viewBox="0 0 32 32" width="100%" height="100%">
            <rect x="2" y="2" width="28" height="28" fill="var(--container-background-color, #1e293b)" stroke="var(--alert-advisory-border-color, #3b82f6)" strokeWidth="2" rx="4" />
            <text x="16" y="22" textAnchor="middle" fontSize="16" fill="var(--alert-advisory-border-color, #3b82f6)">📋</text>
          </svg>
        </div>
      );
    
    // ─────────────────────────────────────────────────────────────────────────
    // DEFAULT FALLBACK
    // ─────────────────────────────────────────────────────────────────────────
    default:
      return (
        <div className="symbol symbol-unknown">
          <div className="symbol-unknown__icon">❓</div>
          <div className="symbol-unknown__type">{item.type}</div>
        </div>
      );
  }
  };

  return <SymbolQualityWrap stale={stale}>{renderInner()}</SymbolQualityWrap>;
};

export default SymbolRenderer;
