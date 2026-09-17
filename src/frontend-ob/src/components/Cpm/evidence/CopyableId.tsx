/**
 * v2.5 workbench: an identifier shown short, the full value on hover, copied with one click.
 * A missing id is a dash - never a made-up one.
 */
import React, { useEffect, useState } from 'react';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import { CpmIconButton } from '../shared';
import { shortId } from './format';

export const CopyableId: React.FC<{ label: string; value: string | null | undefined; chars?: number }> = ({ label, value, chars = 8 }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  if (!value) return <span className="cpm-copy-id"><span className="cpm-mono">—</span></span>;
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
    } catch { /* insecure context or denied: the full id is still in the title */ }
  };
  return (
    <span className="cpm-copy-id" title={value} data-copied={copied ? 'true' : undefined}>
      <span className="cpm-mono">{shortId(value, chars)}</span>
      <CpmIconButton label={`Copy ${label}`} onClick={() => { void copy(); }}><ObiContentCopyGoogle /></CpmIconButton>
      <span role="status" className="cpm-copy-id__status" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </span>
  );
};
