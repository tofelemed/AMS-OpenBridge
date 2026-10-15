/**
 * CHG-098 (SME review 2 #28): one signal path on its own full-width row, monospace, the whole path in the hover
 * title, a Copy action with a visible "Copied" (or "Copy failed") status, and its validation message beside it.
 */
import React, { useEffect, useState } from 'react';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import { CpmIconButton } from '../../shared';
import type { FieldCheck } from './wizardForm';
import './wizard.css';

type CopyState = 'idle' | 'copied' | 'failed';

export const SignalPathField: React.FC<{
  id: string;
  label: string;
  value: string;
  placeholder: string;
  check: FieldCheck;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children?: React.ReactNode;
}> = ({ id, label, value, placeholder, check, onChange, children }) => {
  const [copy, setCopy] = useState<CopyState>('idle');
  useEffect(() => {
    if (copy === 'idle') return;
    const t = setTimeout(() => setCopy('idle'), 2000);
    return () => clearTimeout(t);
  }, [copy]);
  const doCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value.trim());
      setCopy('copied');
    } catch {
      // insecure context or permission denied: the path stays selectable in the field and in the title
      setCopy('failed');
    }
  };
  const msgId = `${id}-msg`;
  const message = check.error ?? check.warning;
  return (
    <div className="cpm-field cpm-path-field">
      <label className="cpm-field__label" htmlFor={id}>{label}</label>
      <div className="cpm-path-field__row">
        <input id={id} className={`cpm-input cpm-mono cpm-path-field__input${check.error ? ' cpm-input--error' : ''}`}
          value={value} onChange={onChange} placeholder={placeholder} title={value.trim() || undefined}
          spellCheck={false} autoComplete="off" aria-invalid={check.error ? true : undefined}
          aria-describedby={message ? msgId : undefined} />
        <CpmIconButton label={`Copy ${label} path`} disabled={!value.trim()} onClick={() => { void doCopy(); }}>
          <ObiContentCopyGoogle />
        </CpmIconButton>
        <span role="status" aria-live="polite" className="cpm-path-field__status">
          {copy === 'copied' ? 'Copied' : copy === 'failed' ? 'Copy failed: select the text' : ''}
        </span>
      </div>
      {message && (
        <span id={msgId} className={check.error ? 'cpm-field__error' : 'cpm-copy cpm-path-field__warn'}>{message}</span>
      )}
      {children}
    </div>
  );
};

export default SignalPathField;
