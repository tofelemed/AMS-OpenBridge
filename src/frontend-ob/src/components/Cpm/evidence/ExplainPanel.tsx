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
import { CpmIconButton, KvRow, TonePill } from '../shared';
import CollapsibleSection from '../CollapsibleSection';
import { methodLabel } from '../vocabulary';
import { gateMark, gateTone } from '../gateStatus';
import type { GateState } from './GateResultState';
import { identityOf, parametersOf } from './gateFacts';
import { reasonSentence, whyParagraphs } from './verdictCopy';
import { CopyableId } from './CopyableId';
import { codeLabel } from '../vocabulary';
import { ExplainWhy } from './ExplainWhy';
import type { InputContext } from '../optionalInputs';
import { useAuthStore } from '../../../store/authStore';

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
  /** The site zone the workbench shows times in. */
  timeZone?: string;
  /** CHG-059: the loop's optional-input context. */
  inputs?: InputContext;
  collapsed: boolean;
  onToggle: () => void;
}

export const ExplainPanel: React.FC<ExplainPanelProps> = ({ gate, run, entry, manifest, state, status, reason, eligibilityDetail, timeZone, inputs, collapsed, onToggle }) => {
  const [showConfig, setShowConfig] = useState(false);
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  if (collapsed) {
    return (
      <aside className="cpm-explain cpm-explain--collapsed" aria-label="Explain (collapsed)">
        <CpmIconButton label="Show explain" onClick={onToggle}><ObiPanelRightOpen /></CpmIconButton>
      </aside>
    );
  }
  const name = entry?.name ?? gate;
  const params = parametersOf(manifest, gate);
  const why = whyParagraphs({ gate, name, status, reason, state, eligibilityDetail });
  return (
    <aside className="cpm-explain cpm-surface" aria-label="Explain">
      <div className="cpm-explain__head">
        <span className="cpm-eyebrow">Explain</span>
        {status && <TonePill tone={gateTone(status, gate)}>{codeLabel(status)}</TonePill>}
        <CpmIconButton label="Hide explain" onClick={onToggle}><ObiPanelRightClose /></CpmIconButton>
      </div>

      {/* SME #13 (CHG-050): sections collapse instead of the column scrolling inside the page;
          "Why this result" — the reason — is the one open by default. */}
      <CollapsibleSection id="wb-explain-why" defaultOpen title="Why this result"
        summary={status ? `${gate}: ${gateMark(status, gate).label}${reason ? ` — ${reasonSentence(reason, { gate, eligibilityDetail })}` : ''}` : why[0]}>
        {/* SME #19 (CHG-055): measured vs required, the evidence, what remains open; the state's next action last */}
        <ExplainWhy gate={gate} name={name} run={run} manifest={manifest} status={status} reason={reason} eligibilityDetail={eligibilityDetail} timeZone={timeZone} inputs={inputs} />
        {why.slice(1).map((p, i) => <p key={i} className="cpm-copy cpm-why__next">{p}</p>)}
      </CollapsibleSection>

      <CollapsibleSection id="wb-explain-asks" title="What this gate asks" summary={entry?.definition ?? undefined}>
        <p className="cpm-copy">{entry?.definition ?? 'No catalogue definition for this gate in this build.'}</p>
        {entry?.preconditions && <KvRow label="Needs">{entry.preconditions}</KvRow>}
        <KvRow label="Role">{entry?.role ?? '—'}</KvRow>
      </CollapsibleSection>

      <CollapsibleSection id="wb-explain-method" title="Method"
        summary={entry ? `${methodLabel(entry.method.id)} v${entry.method.version} · ${run?.tier ?? entry.tier} tier` : undefined}>
        <KvRow label="Method">{entry ? <span title={entry.method.id}>{`${methodLabel(entry.method.id)} v${entry.method.version}`}</span> : '—'}</KvRow>
        <KvRow label="Tier">{run?.tier ?? entry?.tier ?? '—'}</KvRow>
        {entry && entry.capabilityState !== 'INSTALLED' && <KvRow label="Capability">{entry.capabilityState}{entry.capabilityReason ? ` · ${entry.capabilityReason}` : ''}</KvRow>}
      </CollapsibleSection>

      <CollapsibleSection id="wb-explain-params" title="Parameters used"
        summary={params.length ? `${params.length} parameter(s) from the run's artifacts` : 'None declared by the retained artifacts'}>
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
      </CollapsibleSection>

      <CollapsibleSection id="wb-explain-config" title="Configuration" summary="The governed bundle this run ran under.">
        {run ? (
          <>
            <KvRow label="Bundle"><CopyableId label="Bundle hash" value={run.identity.bundleHash} chars={16} /></KvRow>
            {/* CHG-081: reading the configuration is SuperAdmin only; the bundle hash stays for everyone */}
            {canReadConfig && <ObcButton variant="flat" onClick={() => setShowConfig(v => !v)}>{showConfig ? 'Hide configuration used' : 'Configuration this run used ›'}</ObcButton>}
            {canReadConfig && showConfig && <EffectiveConfigDrawer loopId={run.loopId} runBundleHash={run.identity.bundleHash} gateFilter={gate} onClose={() => setShowConfig(false)} />}
          </>
        ) : <p className="cpm-copy">—</p>}
      </CollapsibleSection>

      <CollapsibleSection id="wb-explain-identity" title="Identity" summary="Run, bundle and source ids — copyable.">
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
      </CollapsibleSection>
    </aside>
  );
};
