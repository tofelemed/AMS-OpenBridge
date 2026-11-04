/**
 * SPEC §6.10 text input (K-04): a named native input with helper text, an invalid message, a clear
 * button and a disabled reason. `onChange` follows every keystroke; `onCommit` follows the native
 * `change` event, which fires on blur or Enter after an edit.
 */
import React, { useEffect, useId, useRef } from 'react';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { FieldMessages, fieldDescribedBy, type FieldStateProps } from './field';

export interface TextInputProps extends FieldStateProps {
  label: string;
  /** Names the field without showing the label, for a field that has no visible one. */
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder?: string;
  /** Shows a clear button while the field has a value. */
  clearable?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  label, hideLabel, value, onChange, onCommit, placeholder, clearable, helper, error, disabled, reason,
}) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  // React's onChange is per keystroke, so the committed value needs the DOM event itself.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const fire = () => commit.current?.(input.value);
    input.addEventListener('change', fire);
    return () => input.removeEventListener('change', fire);
  }, []);

  const clear = () => {
    onChange('');
    onCommit?.('');
    inputRef.current?.focus();
  };

  const showClear = !!clearable && value.length > 0 && !disabled;

  return (
    <div className="ui-field">
      {!hideLabel && <label htmlFor={id} className="ui-field__label">{label}</label>}
      <div className="ui-input-box">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className={`ui-input${clearable ? ' ui-input--clearable' : ''}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-label={hideLabel ? label : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(id, { helper, error, disabled, reason })}
          onChange={e => onChange(e.target.value)}
        />
        {showClear && (
          <button type="button" className="ui-input__clear" aria-label={`Clear ${label}`} onClick={clear}>
            <span className="ui-icon ui-icon--small"><ObiCloseGoogle /></span>
          </button>
        )}
      </div>
      <FieldMessages id={id} helper={helper} error={error} disabled={disabled} reason={reason} />
    </div>
  );
};
