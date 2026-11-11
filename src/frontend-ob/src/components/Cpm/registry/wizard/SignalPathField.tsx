/**
 * CHG-098 (SME review 2 #28): one signal path on its own full-width row, monospace, the whole path in the hover
 * title, a Copy action with a visible "Copied" (or "Copy failed") status, and its validation message beside it.
 * CHG-168 (owner review): the role's pen colour beside its label (the one signal colour source), the label beside the path.
 */
import React, { useEffect, useState } from 'react';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import { CpmIconButton } from '../../shared';
import { copyText } from '../../../../utils/copyText';
import type { FieldCheck } from './wizardForm';
import './wizard.css';

type CopyState = 'idle' | 'copied' | 'failed';

export const SignalPathField: React.FC<{
  id: string;
  label: string;
  /** The role, for its pen colour (pv, sp, op, mode, vp). */
  pen?: string;
  value: string;
  placeholder: string;
  check: FieldCheck;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children?: React.ReactNode;
}> = ({ id, label, pen, value, placeholder, check, onChange, children }) => {
  const [copy, setCopy] = useState<CopyState>('idle');
  useEffect(() => {
    if (copy === 'idle') return;
    const t = setTimeout(() => setCopy('idle'), 2000);
    return () => clearTimeout(t);
  }, [copy]);
  // utils/copyText falls back to a hidden textarea, so the copy also works on the plant's http origin.
  // A refusal leaves the path selectable in the field and in the title.
  const doCopy = async () => setCopy(await copyText(value.trim()) ? 'copied' : 'failed');
  const msgId = `${id}-msg`;
  const message = check.error ?? check.warning;
  return (
    <div className="cpm-field cpm-path-field">
      <label className="ui-field__label cpm-path-field__label" htmlFor={id}>
        {pen && <span className="cpm-reg-swatch" data-pen={pen} aria-hidden />}{label}
      </label>
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
