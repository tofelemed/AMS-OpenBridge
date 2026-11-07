'use client';

/** Loop Detail: the loop's signal roles and UNS paths, each path with a Copy that says whether it worked. */
import React, { useEffect, useState } from 'react';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import type { CpmLoop } from '../../../api/cpmApi';
import { CpmIconButton, PanelHead } from '../shared';
import { signalRows } from './loopDetailFacts';

export const SignalMapping: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const [copy, setCopy] = useState<{ role: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!copy) return;
    const t = setTimeout(() => setCopy(null), 2000);
    return () => clearTimeout(t);
  }, [copy]);
  const doCopy = async (role: string, path: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(path);
      setCopy({ role, ok: true });
    } catch {
      setCopy({ role, ok: false });
    }
  };
  const rows = signalRows(loop);
  return (
    <section className="cpm-surface" aria-label="Signal mapping">
      <PanelHead title="Signal mapping" />
      {rows.length === 0 ? <p className="cpm-copy">No signal is mapped.</p> : (
        <table className="cpm-table" aria-label="Signal mapping">
          <thead><tr><th>Role</th><th>UNS path</th><th><span className="cpm-sr-only">Copy</span></th></tr></thead>
          <tbody>
            {rows.map(([role, path]) => (
              <tr key={role}>
                <td>{role}</td>
                <td className="cpm-mono" title={path}>{path}</td>
                <td>
                  <CpmIconButton label={`Copy ${role} path`} onClick={() => { void doCopy(role, path); }}><ObiContentCopyGoogle /></CpmIconButton>
                  <span role="status" aria-live="polite" className="cpm-event-row__sub">
                    {copy?.role === role ? (copy.ok ? 'Copied' : 'Copy failed: select the text') : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default SignalMapping;
