/**
 * SPEC 6.13, CD17: IDs, versions and paths stay available for traceability, collapsed behind a
 * native disclosure so operators do not read them by default. Each value copies through a real
 * button, and the outcome is announced. A failed copy says so: the Clipboard API needs a secure
 * context, so a plant served over plain http has none.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import { copyText } from '../utils/copyText';
import './technical-details.css';

const MESSAGE_MS = 3000;

export interface TechnicalDetail {
  label: string;
  /** Null or empty reads "Not available", with nothing to copy. */
  value: string | number | null | undefined;
  /** Identifiers are monospace. Set false for a plain-word value. */
  mono?: boolean;
}

/** Plant pages are served over http, where `navigator.clipboard` is missing: copyText falls back to a textarea. */
const writeToClipboard = copyText;

export const TechnicalDetails: React.FC<{ items: TechnicalDetail[] }> = ({ items }) => {
  const [message, setMessage] = useState('');
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (item: TechnicalDetail) => {
    const copied = await writeToClipboard(String(item.value));
    setMessage(copied ? `${item.label} copied` : `Copy failed: ${item.label}`);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), MESSAGE_MS);
  };

  if (items.length === 0) return null;
  return (
    <details className="ui-technical">
      <summary className="ui-technical__summary">Technical details</summary>
      <dl className="ui-technical__list">
        {items.map(item => {
          const present = item.value != null && item.value !== '';
          return (
            <div key={item.label} className="ui-technical__row">
              <dt className="ui-technical__label">{item.label}</dt>
              <dd className="ui-technical__value">
                {present
                  ? <span className={item.mono === false ? undefined : 'ui-technical__mono'}>{item.value}</span>
                  : <span className="ui-technical__missing">Not available</span>}
                {present && (
                  <button
                    type="button"
                    className="ui-control ui-control--ghost ui-control--icon ui-technical__copy"
                    aria-label={`Copy ${item.label}`}
                    onClick={() => { void copy(item); }}
                  >
                    <span className="ui-icon ui-icon--small"><ObiContentCopyGoogle /></span>
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="ui-technical__status" role="status" aria-live="polite">{message}</p>
    </details>
  );
};
