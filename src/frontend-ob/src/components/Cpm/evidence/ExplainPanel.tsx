/**
 * v2.5 workbench (audit F16): the explain column of THE SELECTED RUN - what the gate asks, which
 * method ran, why the result is what it is (sentences ending with the next valid action), the
 * parameters the run used (labelled, formatted, raw key on hover), the configuration it ran under
 * and its identity (short ids, copyable). Collapses to a rail; the choice is remembered.
 */
import React, { useCallback, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiPanelRightClose } from '@oicl/openbridge-webcomponents-react/icons/icon-panel-right-close';
import { ObiPanelRightOpen } from '@oicl/openbridge-webcomponents-react/icons/icon-panel-right-open';
import type { EvidenceManifest, MethodRun } from '../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../api/cpm/catalogue';
import { EffectiveConfigDrawer } from '../config/EffectiveConfigDrawer';
import { CpmIconButton, KvRow, PanelHead, TonePill } from '../shared';
import { gateTone } from '../gateStatus';
import type { GateState } from './GateResultState';
import { identityOf, parametersOf } from './gateFacts';
import { whyParagraphs } from './verdictCopy';
import { CopyableId } from './CopyableId';

const STORAGE_KEY = 'ams-evidence-explain-collapsed';

export function useExplainCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const toggle = useCallback(() => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* private mode: the session still works */ }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}

export interface ExplainPanelProps {
  gate: string;
  run: MethodRun | undefined;
  entry: GateCatalogueEntry | undefined;
  manifest: EvidenceManifest | undefined;
  state: GateState;
  status: string | null;
  reason: string | null;
  eligibilityDetail: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

export const ExplainPanel: React.FC<ExplainPanelProps> = ({ gate, run, entry, manifest, state, status, reason, eligibilityDetail, collapsed, onToggle }) => {
  const [showConfig, setShowConfig] = useState(false);
  if (collapsed) {
    return (
      <aside className="cpm-explain cpm-explain--collapsed" aria-label="Explain (collapsed)">
        <CpmIconButton label="Show explain" onClick={onToggle}><ObiPanelRightOpen /></CpmIconButton>
      </aside>
    );
  }
  const name = entry?.name ?? gate;
  const params = parametersOf(manifest, gate);
  const why = whyParagraphs({ gate, name, status, reason, state, entry, eligibilityDetail });
  return (
    <aside className="cpm-explain cpm-surface" aria-label="Explain">
      <div className="cpm-explain__head">
        <span className="cpm-eyebrow">Explain</span>
        {status && <TonePill tone={gateTone(status)}>{status.replace(/_/g, ' ')}</TonePill>}
        <CpmIconButton label="Hide explain" onClick={onToggle}><ObiPanelRightClose /></CpmIconButton>
      </div>

      <section className="cpm-explain__section">
        <PanelHead eyebrow={gate} title="What this gate asks" />
        <p className="cpm-copy">{entry?.definition ?? 'No catalogue definition for this gate in this build.'}</p>
        {entry?.preconditions && <KvRow label="Needs">{entry.preconditions}</KvRow>}
        <KvRow label="Role">{entry?.role ?? '—'}</KvRow>
      </section>

      <section className="cpm-explain__section">
        <PanelHead eyebrow="Installed" title="Method" />
        <KvRow label="Method">{entry ? `${entry.method.id} v${entry.method.version}` : '—'}</KvRow>
        <KvRow label="Tier">{run?.tier ?? entry?.tier ?? '—'}</KvRow>
        {entry && entry.capabilityState !== 'INSTALLED' && <KvRow label="Capability">{entry.capabilityState}{entry.capabilityReason ? ` · ${entry.capabilityReason}` : ''}</KvRow>}
      </section>

      <section className="cpm-explain__section">
        <PanelHead eyebrow="Reasoning" title="Why this result" />
        {why.map((p, i) => <p key={i} className="cpm-copy">{p}</p>)}
      </section>

      <section className="cpm-explain__section">
        <PanelHead eyebrow="From the run's artifacts" title="Parameters used" />
        {params.length === 0 ? (
          <p className="cpm-copy">No retained artifact declares parameters for this gate{manifest ? '' : ' yet'}.</p>
        ) : (
          <dl className="cpm-explain__params">
            {params.map(p => (
              <React.Fragment key={p.key}>
                <dt title={p.key}>{p.label}</dt>
                <dd title={p.raw}>{p.text}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </section>

      <section className="cpm-explain__section">
        <PanelHead eyebrow="Governed" title="Configuration" />
        {run ? (
          <>
            <KvRow label="Bundle"><CopyableId label="Bundle hash" value={run.identity.bundleHash} chars={16} /></KvRow>
            <ObcButton variant="flat" onClick={() => setShowConfig(v => !v)}>{showConfig ? 'Hide configuration used' : 'Configuration this run used ›'}</ObcButton>
            {showConfig && <EffectiveConfigDrawer loopId={run.loopId} runBundleHash={run.identity.bundleHash} gateFilter={gate} onClose={() => setShowConfig(false)} />}
          </>
        ) : <p className="cpm-copy">—</p>}
      </section>

      <section className="cpm-explain__section">
        <PanelHead eyebrow="Immutable" title="Identity" />
        {run ? (
          <div className="cpm-explain__identity">
            {identityOf(run).map(row => (
              <KvRow key={row.label} label={row.label}>
                {row.label === 'Source' || row.label === 'Purpose' || row.label === 'Revisions'
                  ? (row.value ?? '—')
                  : <CopyableId label={row.label} value={row.value} chars={row.label === 'Bundle' ? 16 : 12} />}
              </KvRow>
            ))}
          </div>
        ) : <p className="cpm-copy">—</p>}
      </section>
    </aside>
  );
};
