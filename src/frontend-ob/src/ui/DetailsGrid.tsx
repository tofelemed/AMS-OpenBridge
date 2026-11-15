/**
 * CHG-190 (owner review 2026-11-14, items 13 and 14): the Details part of the owner's reference detail panel. A small
 * "Details" head, then two columns of Secondary A buttons (item 17), each its label with a › at its end. A button opens
 * a dialog, or the page part it names. Used through Inspector's `details` slot.
 * CHG-192 (owner review item 16, carried from CHG-190): a label never wraps inside its button. The grid measures the widest
 * button on one line (`--ui-details-fit`) and falls back to one column when two of that width do not fit its box; the
 * button's height and font are unchanged.
 */
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import './inspector-reference.css';

export interface DetailItem {
  label: string;
  onClick: () => void;
  /** It opens a dialog (aria-haspopup). */
  dialog?: boolean;
  /** Unavailable: the panel says why on screen, under its primary action. */
  disabled?: boolean;
}

/** The width a button needs to show its label on one line: a hidden copy of it, laid out at its own content width. */
export function oneLineWidth(button: HTMLElement): number {
  const copy = button.cloneNode(true) as HTMLElement;
  copy.setAttribute('aria-hidden', 'true');
  copy.style.position = 'absolute';
  copy.style.visibility = 'hidden';
  copy.style.width = 'max-content';
  copy.style.whiteSpace = 'nowrap';
  button.parentElement?.appendChild(copy);
  const width = copy.getBoundingClientRect().width;
  copy.remove();
  return width;
}

export const DetailsGrid: React.FC<{ items: DetailItem[] }> = ({ items }) => {
  const id = useId();
  const grid = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const labels = items.map(i => i.label).join('\n');
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      if (!live || !grid.current) return;
      const widths = Array.from(grid.current.querySelectorAll<HTMLElement>('.ui-details__item')).map(oneLineWidth);
      setFit(Math.ceil(Math.max(0, ...widths)));
    };
    measure();
    // a web font that arrives later changes the widths
    void document.fonts?.ready?.then(measure);
    return () => { live = false; };
  }, [labels]);
  if (items.length === 0) return null;
  return (
    <section className="ui-details" aria-labelledby={id}>
      <h3 id={id} className="ui-details__head">Details</h3>
      <div ref={grid} className="ui-details__grid" style={{ '--ui-details-fit': `${fit}px` } as React.CSSProperties}>
        {items.map(item => (
          <button key={item.label} type="button" className="ui-btn ui-btn--secondary ui-details__item"
            aria-haspopup={item.dialog ? 'dialog' : undefined} disabled={item.disabled} onClick={item.onClick}>
            <span className="ui-details__label">{item.label}</span>
            <span className="ui-details__chevron" aria-hidden="true">{'›'}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default DetailsGrid;
