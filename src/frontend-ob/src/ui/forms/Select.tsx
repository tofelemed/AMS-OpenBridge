/** SPEC §6.10 select (K-09): a named native select with an invalid message and a disabled reason. */
import React, { useId } from 'react';
import { FieldMessages, fieldDescribedBy, type FieldStateProps } from './field';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> extends FieldStateProps {
  label: string;
  /** Names the select without showing the label, for a select that has no visible one. */
  hideLabel?: boolean;
  options: ReadonlyArray<SelectOption<T>>;
  /** Option groups, drawn after `options` (CHG-158: the fused and the short windows). */
  groups?: ReadonlyArray<{ label: string; options: ReadonlyArray<SelectOption<T>> }>;
  value: T;
  onChange: (value: T) => void;
}

export function Select<T extends string>({
  label, hideLabel, options, groups, value, onChange, helper, error, disabled, reason,
}: SelectProps<T>): React.ReactElement {
  const id = useId();
  return (
    <div className="ui-field">
      {!hideLabel && <label htmlFor={id} className="ui-field__label">{label}</label>}
      <select
        id={id}
        className="ui-select"
        value={value}
        disabled={disabled}
        aria-label={hideLabel ? label : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy(id, { helper, error, disabled, reason })}
        onChange={e => onChange(e.target.value as T)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        {groups?.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
      <FieldMessages id={id} helper={helper} error={error} disabled={disabled} reason={reason} />
    </div>
  );
}
