/**
 * SPEC §6.10 filter chip (K-06): a real toggle button with `aria-pressed`. The selected chip also
 * carries a check mark and a heavier weight, so its state is not colour alone.
 */
import React from 'react';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';
import { useDisabledReason } from './field';

export const FilterChip: React.FC<{
  label: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  reason?: string | null;
}> = ({ label, selected, onToggle, disabled, reason }) => {
  const why = useDisabledReason(disabled, reason);
  return (
    <>
      <button
        type="button"
        className="ui-control ui-chip"
        aria-pressed={selected}
        aria-disabled={disabled || undefined}
        aria-describedby={why.describedBy}
        onClick={() => { if (!disabled) onToggle(); }}
      >
        {selected && <span className="ui-icon ui-icon--small"><ObiCheckGoogle /></span>}
        {label}
      </button>
      {why.note}
    </>
  );
};
