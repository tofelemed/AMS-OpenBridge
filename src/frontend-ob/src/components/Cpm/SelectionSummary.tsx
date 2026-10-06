/**
 * SME review #13 (CHG-050): the page's pickers (scope, loop, window, jump-to-date, case chips) folded
 * into one line once a selection exists — "FIC10401 · 24h fused · window ending 6 Oct 07:45 · Change ▾".
 * The sticky context bar already names the loop and period, so the full panel only costs height until
 * the user wants to change something. With nothing selected yet the panel is simply open.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

export const SelectionSummary: React.FC<{
  /** The current selection in one line; null = nothing chosen yet (the pickers are shown). */
  summary: string | null;
  children: React.ReactNode;
}> = ({ summary, children }) => {
  const [open, setOpen] = useState(false);
  if (!summary) return <>{children}</>;
  return (
    <div className="cpm-selection">
      <div className="cpm-selection__line">
        <span className="cpm-eyebrow">Showing</span>
        <span className="cpm-selection__text">{summary}</span>
        <ObcButton variant="flat" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          {open ? 'Done ▴' : 'Change ▾'}
        </ObcButton>
      </div>
      {open && children}
    </div>
  );
};

export default SelectionSummary;
