/**
 * CHG-098 (SME review 2 #25): a sortable column heading. A real button (keyboard, focus ring) whose name says the
 * column and the order it is in; the arrow shows on the active column only. Used by the Calculations catalogue
 * (client-side sort of the full filtered list) and Loop Events (the two orders the server pages by).
 */
import React from 'react';
import { ObiArrowDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-arrow-down-google';
import { ObiArrowUpGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-arrow-up-google';

export type SortDir = 'asc' | 'desc';

export const SortHeader: React.FC<{
  label: string;
  /** Set on the column the list is ordered by. */
  active: SortDir | null;
  /** How the order reads in words, for the accessible name and the hover title ("worst first", "newest first"). */
  orderText?: string;
  title?: string;
  onSort: () => void;
}> = ({ label, active, orderText, title, onSort }) => (
  <button type="button" className={`cpm-sort-head${active ? ' cpm-sort-head--active' : ''}`}
    aria-label={active ? `${label}, sorted ${orderText ?? (active === 'asc' ? 'ascending' : 'descending')}` : `Sort by ${label}`}
    title={title} onClick={onSort}>
    <span>{label}</span>
    {active && (
      <span className="cpm-sort-head__icon" aria-hidden>
        {active === 'asc' ? <ObiArrowUpGoogle /> : <ObiArrowDownGoogle />}
      </span>
    )}
  </button>
);

export default SortHeader;
