/**
 * SPEC 6.7, CD16: ⓘ beside a value opens its definition, ? in a panel header opens "How to read this
 * view". A real button (WCAG 4.1.2) that a browser activates on click, Enter or Space (2.1.1); hover
 * after 300 ms is an enhancement only. The panel stays while hovered or focused, Esc dismisses it
 * (1.4.13), and one is open at a time.
 *
 * The panel stays in the DOM beside its button rather than in a portal, so reading order, Tab order
 * and the focus trap of a Dialog or Inspector drawer all include it. It is placed with
 * `position: fixed` from the button's rect and raised to the top layer where the browser has the
 * Popover API: no overflow, transform or stacking context can clip it there (a sticky table header
 * is one). `popover="manual"` leaves every open and close decision here.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ObiHelp } from '@oicl/openbridge-webcomponents-react/icons/icon-help';
import { ObiInfo } from '@oicl/openbridge-webcomponents-react/icons/icon-info';
import { cpaHref } from '../components/Cpm/cpaHref';
import { helpFor, type HelpEntry } from '../help/registry';
import './toggletip.css';

const HOVER_DELAY_MS = 300;
/** Lets the pointer cross the gap from button to panel (WCAG 1.4.13, hoverable). */
const LEAVE_GRACE_MS = 150;
const HOW_TO = 'How to read this view';

/** The one open toggletip on the page. */
let closeActive: (() => void) | null = null;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

type Size = { width: number; height: number };
export interface Spot { top: number; left: number }

/** Below the button when it fits, else above when that fits, and always inside the viewport. */
export function placeToggletip(button: Pick<DOMRect, 'top' | 'bottom' | 'left'>, panel: Size, view: Size, gap: number): Spot {
  const below = button.bottom + gap;
  const above = button.top - gap - panel.height;
  const fitsBelow = below + panel.height <= view.height - gap;
  const top = !fitsBelow && above >= gap ? above : below;
  return {
    top: clamp(top, gap, view.height - panel.height - gap),
    left: clamp(button.left, gap, view.width - panel.width - gap),
  };
}

const viewport = (): Size => ({
  width: document.documentElement.clientWidth || window.innerWidth,
  height: window.innerHeight,
});

const offScreen = (r: DOMRect, view: Size) => r.bottom < 0 || r.top > view.height || r.right < 0 || r.left > view.width;

/** The first spacing step, in px, as the panel's own tokens resolve it. */
const edgeGap = (panel: Element) => parseFloat(getComputedStyle(panel).getPropertyValue('--traverse-space-2')) || 0;

/** The marker stops a second call: `showPopover` throws on a popover that is already open. */
function raiseToTopLayer(panel: HTMLElement) {
  if (typeof panel.showPopover !== 'function' || panel.hasAttribute('popover')) return;
  panel.setAttribute('popover', 'manual');
  panel.showPopover();
}

const FIELDS: { key: 'what' | 'formula' | 'window' | 'unit' | 'source'; label: string }[] = [
  { key: 'what', label: 'What it measures' },
  { key: 'formula', label: 'Formula' },
  { key: 'window', label: 'Window and eligibility' },
  { key: 'unit', label: 'Unit' },
  { key: 'source', label: 'Source and version' },
];

const CalculationLink: React.FC<{ metric: string; onNavigate: () => void }> = ({ metric, onNavigate }) => {
  const { search } = useLocation();
  return (
    <Link
      className="ui-toggletip__link"
      to={cpaHref('/cpm/calculations', search, { metric })}
      onClick={onNavigate}
    >
      Full calculation →
    </Link>
  );
};

/** Puts served values into a registry text's `{x}` placeholders (UI-037). One with no value stays as written. */
export function fillPlaceholders(text: string, values?: Record<string, string | number>): string {
  if (!values) return text;
  return text.replace(/\{([^{}]+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** The fixed template (CD16). The registry's text is shown as it stands (RD10). */
const Definition: React.FC<{
  entry: HelpEntry;
  calculation?: string;
  values?: Record<string, string | number>;
  onNavigate: () => void;
}> = ({ entry, calculation, values, onNavigate }) => (
  <>
    {entry.status === 'as-implemented' && <p className="ui-toggletip__status">As implemented, pending approval</p>}
    <dl className="ui-toggletip__fields">
      {FIELDS.filter(f => entry[f.key]).map(f => (
        <div key={f.key}>
          <dt>{f.label}</dt>
          <dd>{fillPlaceholders(entry[f.key], values)}</dd>
        </div>
      ))}
    </dl>
    <CalculationLink metric={calculation ?? entry.id} onNavigate={onNavigate} />
  </>
);

interface TipProps {
  name: string;
  heading: string;
  variant: 'info' | 'how-to';
  children: (close: () => void) => React.ReactNode;
}

const Tip: React.FC<TipProps> = ({ name, heading, variant, children }) => {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  /** Opened by click or key rather than hover: the next click closes it. */
  const pinned = useRef(false);
  const timer = useRef<number>();

  const stopTimer = useCallback(() => window.clearTimeout(timer.current), []);

  const hide = useCallback(() => {
    stopTimer();
    pinned.current = false;
    if (closeActive === hide) closeActive = null;
    setOpen(false);
  }, [stopTimer]);

  const show = useCallback(() => {
    stopTimer();
    if (closeActive !== hide) closeActive?.();
    closeActive = hide;
    setOpen(true);
  }, [hide, stopTimer]);

  const closeWhenIdle = useCallback(() => {
    stopTimer();
    timer.current = window.setTimeout(() => {
      if (!hovering.current && !rootRef.current?.contains(document.activeElement)) hide();
    }, LEAVE_GRACE_MS);
  }, [hide, stopTimer]);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (closeActive === hide) closeActive = null;
  }, [hide]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!open || !panel || !button) return undefined;
    raiseToTopLayer(panel);
    const place = () => {
      const view = viewport();
      const rect = button.getBoundingClientRect();
      if (offScreen(rect, view)) { hide(); return; }
      const next = placeToggletip(rect, panel.getBoundingClientRect(), view, edgeGap(panel));
      setSpot(s => (s?.top === next.top && s.left === next.left ? s : next));
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, hide]);

  useEffect(() => {
    if (!open) return undefined;
    // Capture, and stopped here: the Esc that closes a toggletip must not also close the dialog under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      const active = document.activeElement;
      const keepFocus = active && active !== document.body && !rootRef.current?.contains(active);
      hide();
      if (!keepFocus) buttonRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, hide]);

  const onButtonClick = () => {
    stopTimer();
    buttonRef.current?.focus(); // Safari does not focus a clicked button, and focus is what keeps it open.
    if (!open) {
      pinned.current = true;
      show();
    } else if (pinned.current) {
      hide();
    } else {
      pinned.current = true; // Hover got there first: this click keeps it rather than closing it.
    }
  };

  const onEnter = () => {
    hovering.current = true;
    stopTimer();
    if (!open) timer.current = window.setTimeout(show, HOVER_DELAY_MS);
  };

  const onLeave = () => {
    hovering.current = false;
    if (open) closeWhenIdle();
    else stopTimer();
  };

  return (
    // A table row or sort heading may sit around this: its own click and Enter must not reach them.
    <span
      ref={rootRef}
      className="ui-toggletip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onBlur={() => { if (open) closeWhenIdle(); }}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="ui-toggletip__button"
        aria-label={name}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onButtonClick}
      >
        <span className={`ui-toggletip__glyph${variant === 'how-to' ? ' ui-toggletip__glyph--help' : ''}`}>{variant === 'how-to' ? <ObiHelp /> : <ObiInfo />}</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="ui-toggletip__panel"
          role="group"
          aria-label={name}
          tabIndex={0}
          style={{ top: spot?.top ?? 0, left: spot?.left ?? 0 }}
        >
          <p className="ui-toggletip__name">{heading}</p>
          {children(hide)}
        </div>
      )}
    </span>
  );
};

export interface ToggletipProps {
  /** An `M-###` id: the panel shows that registry entry in the fixed template. */
  metric?: string;
  /** The value's label on the page: names the button ("About <label>") and heads the panel. Defaults to the registry name. */
  label?: string;
  /** `info` is ⓘ, `how-to` is ?. Defaults to ⓘ for a registry entry and ? for free content. */
  variant?: 'info' | 'how-to';
  /** The `?metric=` value when it is not the `M-###` id. */
  calculation?: string;
  /** Served values for the entry's `{x}` placeholders. */
  values?: Record<string, string | number>;
  /** Free content in place of the template. */
  children?: React.ReactNode;
}

/** Renders nothing for an unknown id with no free content: a help button must have help behind it. */
export const Toggletip: React.FC<ToggletipProps> = ({ metric, label, variant, calculation, values, children }) => {
  const entry = helpFor(metric);
  if (!entry && children == null) return null;
  const kind = variant ?? (entry ? 'info' : 'how-to');
  const subject = label ?? entry?.name;
  const name = kind === 'info' && subject ? `About ${subject}` : subject ?? HOW_TO;
  return (
    <Tip name={name} heading={subject ?? HOW_TO} variant={kind}>
      {close => (children != null
        ? <div className="ui-toggletip__body">{children}</div>
        : entry && <Definition entry={entry} calculation={calculation} values={values} onNavigate={close} />)}
    </Tip>
  );
};
