/**
 * What every form control shares (SPEC §6.10): helper text, an invalid message with its icon, the
 * reason a control is disabled, and the `aria-describedby` that ties them to the control.
 */
import React, { useId } from 'react';
import { ObiError } from '@oicl/openbridge-webcomponents-react/icons/icon-error';
import './forms.css';

export interface FieldStateProps {
  helper?: string;
  /** Marks the field invalid and says why. */
  error?: string | null;
  disabled?: boolean;
  /** Why the control is unavailable; shown only while disabled. */
  reason?: string | null;
}

export const fieldDescribedBy = (id: string, { helper, error, disabled, reason }: FieldStateProps) => {
  const ids = [helper && `${id}-helper`, error && `${id}-error`, disabled && reason && `${id}-reason`].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
};

export const FieldMessages: React.FC<FieldStateProps & { id: string }> = ({ id, helper, error, disabled, reason }) => (
  <>
    {helper && <p id={`${id}-helper`} className="ui-meta">{helper}</p>}
    {error && (
      <p id={`${id}-error`} className="ui-field__error ui-field__message" role="alert">
        <span className="ui-icon ui-icon--small"><ObiError /></span>
        {error}
      </p>
    )}
    {disabled && reason && <p id={`${id}-reason`} className="ui-meta">{reason}</p>}
  </>
);

/** For a button-like control: the visible reason, and the id that ties it to the control. */
export function useDisabledReason(disabled?: boolean, reason?: string | null) {
  const id = useId();
  const show = !!disabled && !!reason;
  return {
    describedBy: show ? id : undefined,
    note: show ? <span id={id} className="ui-meta">{reason}</span> : null,
  };
}
