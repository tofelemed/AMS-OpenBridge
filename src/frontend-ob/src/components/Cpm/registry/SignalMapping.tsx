'use client';

/**
 * CHG-168 (owner review, the approved sample, badge 8): Which signals feed the loop? Each role with its pen colour from the one
 * signal colour source (--signal-*), its path under the plant path ("…/fic10401.pv": the plant path is said once, in its row),
 * the whole path on hover and in Copy, which says whether it worked. A required role that is not mapped says so, with the
 * server's advice behind a ?. It replaced the Signal mapping table, whose every path repeated the plant path.
 */
import React, { useEffect, useState } from 'react';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';
import { Toggletip } from '../../../ui/Toggletip';
import { CpmIconButton, TonePill } from '../shared';
import { copyText } from '../../../utils/copyText';
import { shortPath, signalRows } from './loopPanelFacts';

export const SignalMapping: React.FC<{ loop: CpmLoop; readiness?: Pick<CpmReadiness, 'checks'> }> = ({ loop, readiness }) => {
  const [copy, setCopy] = useState<{ role: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!copy) return;
    const t = setTimeout(() => setCopy(null), 2000);
    return () => clearTimeout(t);
  }, [copy]);
  const doCopy = async (role: string, path: string) => setCopy({ role, ok: await copyText(path) });
  return (
    <section className="cpm-events-panel__sect" aria-label="Signals">
      <div className="cpm-title-row">
        <h3 className="cpm-panel-title">Signals</h3>
        <Toggletip variant="how-to" label="Signal paths"><p>Paths sit under the plant path; the whole path is on hover and in Copy.</p></Toggletip>
      </div>
      {signalRows(loop, readiness).map(({ role, path, advice }) => (
        <div key={role} className="cpm-reg-signal">
          <span className="cpm-reg-signal__role"><span className="cpm-reg-swatch" data-pen={role.toLowerCase()} aria-hidden />{role}</span>
          {path ? (
            <>
              <span className="cpm-mono cpm-reg-signal__path" title={path}>{shortPath(path, loop)}</span>
              <span className="cpm-reg-signal__copy">
                <CpmIconButton label={`Copy ${role} path`} onClick={() => { void doCopy(role, path); }}><ObiContentCopyGoogle /></CpmIconButton>
                <span role="status" aria-live="polite" className="cpm-event-row__sub">
                  {copy?.role === role ? (copy.ok ? 'Copied' : 'Copy failed: select the text') : ''}
                </span>
              </span>
            </>
          ) : (
            <span className="cpm-title-row cpm-reg-signal__path">
              <TonePill tone="warn" glyph="!">Not mapped</TonePill>
              {advice && <Toggletip variant="how-to" label={`${role} advice`}><p>{advice}</p></Toggletip>}
            </span>
          )}
        </div>
      ))}
    </section>
  );
};

export default SignalMapping;
