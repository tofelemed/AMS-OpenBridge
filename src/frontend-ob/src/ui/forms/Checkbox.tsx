/** SPEC §6.10 checkbox (K-08): a native checkbox inside its label, so each one is announced by name. */
import React, { useId } from 'react';
import { FieldMessages, fieldDescribedBy, type FieldStateProps } from './field';

export interface CheckboxProps extends FieldStateProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange, helper, error, disabled, reason }) => {
  const id = useId();
  return (
    <div className="ui-field">
      <label className="ui-checkbox">
        <input
          type="checkbox"
          className="ui-checkbox__box"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(id, { helper, error, disabled, reason })}
          onChange={e => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      <FieldMessages id={id} helper={helper} error={error} disabled={disabled} reason={reason} />
    </div>
  );
};
