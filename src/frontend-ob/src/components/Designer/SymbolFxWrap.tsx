/**
 * A Designer symbol's effects wrapper and its NE107 quality badge (moved out of SymbolRenderer.tsx for CHG-176; the
 * look is unchanged: the badge's colour fallbacks were dropped because openbridge-bridge.css always defines both
 * tokens). CHG-176: a value whose binding is not trusted always shows the badge, and its tooltip names the reason once
 * (inner charts and tables report their trust through ./trustReport).
 */
import React from 'react';
import type { QualityInfo } from '../../utils/quality';

const BADGE: React.CSSProperties = {
  position: 'absolute', top: 0, right: 0, fontSize: 10, lineHeight: 1, padding: '1px 3px', borderRadius: 3,
  color: 'var(--container-background-color)', filter: 'grayscale(0)', opacity: 1,
};

/**
 * The NE107 quality badge: the state's glyph on its alert colour, the label and NE107 category (and, CHG-176, why the
 * value is not trusted) in the tooltip. `inline` puts it in the flow (a trend legend entry) instead of the corner.
 */
export const QualityBadge: React.FC<{ quality: QualityInfo; inline?: boolean }> = ({ quality, inline }) => (
  <span
    aria-label={`quality: ${quality.label}`}
    title={`${quality.label} — NE107: ${quality.ne107}${quality.reason ? ` · ${quality.reason}` : ''}`}
    style={{ ...BADGE, ...(inline ? { position: 'static' } : {}), background: quality.color ?? 'var(--element-disabled-color)', fontWeight: 700 }}
  >{quality.glyph}</span>
);

/** Combined FX wrapper: NE107 quality/staleness + rule-engine (hidden / blink / rotate / color outline). */
export const SymbolFxWrap: React.FC<{
  stale: boolean; hidden: boolean; blink: boolean; outlineColor?: string; rotateDeg?: number;
  /** Design mode, symbol takes a tag, nothing bound → dashed outline. Makes a forgotten binding
      visible at a glance across a display with hundreds of symbols. */
  unbound?: boolean;
  /** Phase 6 — ISA-18.2/NE107 quality of the primary slot; a badge shows for any non-good state. */
  quality?: QualityInfo | null;
  showQuality?: boolean;
  /** Author conditional-format / multi-state colour. Sets the CONTENT colour (`currentColor`), so every
      equipment SVG that draws with `currentColor` (pump/valve/motor/tank outline + reading) recolours
      with the state — instead of a box being drawn around it. */
  contentColor?: string;
  children: React.ReactNode;
}> = ({ stale, hidden, blink, outlineColor, rotateDeg, unbound, quality, showQuality, contentColor, children }) => {
  if (hidden) return null;
  const style: React.CSSProperties = { position: 'relative', width: '100%', height: '100%' };
  if (contentColor) style.color = contentColor;
  if (stale) { style.filter = 'grayscale(1)'; style.opacity = 0.5; }
  if (rotateDeg !== undefined) style.transform = `rotate(${rotateDeg}deg)`;
  if (outlineColor) { style.outline = `3px solid ${outlineColor}`; style.outlineOffset = '1px'; style.borderRadius = '4px'; }
  const cls = `symbol-fx${blink ? ' symbol-fx--blink' : ''}${stale ? ' symbol-quality-stale' : ''}${unbound ? ' symbol-unbound' : ''}`;
  // Show the NE107 badge for any abnormal quality. Bad/Uncertain are safety-relevant and surface
  // ALWAYS (even without the per-symbol opt-in) so a failed/frozen tag can never be silently hidden;
  // the informational states (maintenance / out-of-service) stay behind `showQuality` - unless the value's binding is
  // not trusted (CHG-176: a reason is given), which always shows. Falls back to the legacy stale ⚠ for symbols that
  // don't render quality at all.
  const safetyState = !!quality && (quality.state === 'bad' || quality.state === 'uncertain');
  const showBadge = !!quality && quality.state !== 'good' && (!!showQuality || safetyState || !!quality.reason);
  return (
    <div className={cls} style={style}>
      {children}
      {showBadge ? <QualityBadge quality={quality!} /> : stale && (
        <span aria-label="stale" style={{ ...BADGE, background: 'var(--element-disabled-color)' }}>⚠</span>
      )}
    </div>
  );
};
