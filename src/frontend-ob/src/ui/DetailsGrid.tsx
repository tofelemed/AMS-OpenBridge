/**
 * CHG-190 (owner review 2026-11-14, items 13 and 14): the Details part of the owner's reference detail panel. A small
 * "Details" head, then two columns of Secondary A buttons (item 17), each its label with a › at its end. A button opens
 * a dialog, or the page part it names. Used through Inspector's `details` slot.
 */
import React, { useId } from 'react';
import './inspector-reference.css';

export interface DetailItem {
  label: string;
  onClick: () => void;
  /** It opens a dialog (aria-haspopup). */
  dialog?: boolean;
  /** Unavailable: the panel says why on screen, under its primary action. */
  disabled?: boolean;
}

export const DetailsGrid: React.FC<{ items: DetailItem[] }> = ({ items }) => {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <section className="ui-details" aria-labelledby={id}>
      <h3 id={id} className="ui-details__head">Details</h3>
      <div className="ui-details__grid">
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
