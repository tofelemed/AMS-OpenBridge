/** SPEC §6.10 input chip (K-11): one button, named "Remove <label>", that removes what it shows. */
import React from 'react';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { useDisabledReason } from './field';

export const InputChip: React.FC<{
  label: string;
  onRemove: () => void;
  disabled?: boolean;
  reason?: string | null;
}> = ({ label, onRemove, disabled, reason }) => {
  const why = useDisabledReason(disabled, reason);
  return (
    <>
      <button
        type="button"
        className="ui-control ui-chip"
        aria-label={`Remove ${label}`}
        aria-disabled={disabled || undefined}
        aria-describedby={why.describedBy}
        onClick={() => { if (!disabled) onRemove(); }}
      >
        {label}
        <span className="ui-icon ui-icon--small"><ObiCloseGoogle /></span>
      </button>
      {why.note}
    </>
  );
};
