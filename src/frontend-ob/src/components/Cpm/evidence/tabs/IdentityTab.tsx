/**
 * Task 16: the Workbench's Identity & raw tab. Who produced this run (ids, copyable), the flags on its window, the
 * artifacts it holds with their basis (a rebuilt array is labelled as rebuilt), and the raw record. Two copy buttons: the
 * run id, and the identity record as JSON.
 */
import React, { useEffect, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';
import { KvRow } from '../../shared';
import type { InputContext } from '../../optionalInputs';
import { CopyableId } from '../CopyableId';
import { identityOf } from '../gateFacts';
import { WindowFlags, type WindowFlagsRow } from '../VerdictCard';

const PLAIN = new Set(['Source', 'Purpose', 'Revisions']);

export const IdentityTab: React.FC<{
  run: MethodRun | undefined;
  manifest: EvidenceManifest | undefined;
  /** The window's flags row; absent when the run's window is not among the loaded windows. */
  flags: WindowFlagsRow | undefined;
  inputs?: InputContext;
}> = ({ run, manifest, flags, inputs }) => {
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(''), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard?.writeText(text); setCopied(`${what} copied`); } catch { setCopied(`Copy failed: ${what}`); }
  };
  const identity = run ? identityOf(run) : [];
  const artifacts = manifest?.artifacts ?? [];
  return (
    <div className="cpm-workbench__tab">
      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">Identity</h3>
        {run ? identity.map(row => (
          <KvRow key={row.label} label={row.label}>
            {PLAIN.has(row.label) ? (row.value ?? '—') : <CopyableId label={row.label} value={row.value} chars={row.label === 'Bundle' ? 16 : 12} />}
          </KvRow>
        )) : <p className="cpm-copy">—</p>}
        {run && (
          <div className="cpm-workbench__links">
            <ObcButton variant="flat" onClick={() => void copy('Run ID', run.methodRunId)}>Copy run ID</ObcButton>
            <ObcButton variant="flat" onClick={() => void copy('Identity record', JSON.stringify(Object.fromEntries(identity.map(r => [r.label, r.value])), null, 2))}>Copy identity record</ObcButton>
            <span role="status" aria-live="polite" className="cpm-copy-id__status">{copied}</span>
          </div>
        )}
      </section>

      <WindowFlags row={flags} inputs={inputs} />

      <section className="cpm-surface">
        <h3 className="cpm-eyebrow">Artifacts</h3>
        {artifacts.length === 0 ? <p className="cpm-copy">No artifact is held for this run.</p> : (
          <table className="cpm-table" aria-label="Artifacts of this run">
            <thead><tr><th>Gate</th><th>Kind</th><th>Basis</th><th>State</th></tr></thead>
            <tbody>
              {artifacts.map(a => (
                <tr key={a.artifactId}>
                  <td>{a.gate}</td><td className="cpm-mono">{a.kind}</td>
                  <td>{a.basis === 'RECONSTRUCTED' ? 'Rebuilt' : 'Retained'}</td><td>{a.readiness}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {run && (
        <details className="cpm-surface">
          <summary>Raw record</summary>
          <pre className="cpm-mono cpm-workbench__raw">{JSON.stringify(run, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

export default IdentityTab;
