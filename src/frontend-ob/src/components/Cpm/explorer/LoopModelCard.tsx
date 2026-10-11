/**
 * 2026-09-17 audit F12: the loop as the engines see it - the v2.5 loop-model dimensions (2G.1) with
 * where the classification came from, the acquisition contract that bounds the methods, and the three
 * ways into the loop's evidence: the workbench, the response page, the configuration it runs under.
 * 2026-09-20 (cpa-ui-fix-plan Phase 3): the two routes are OpenBridge buttons; the Workbench one opens
 * the exact fused run when the Summary knows it (passed in), else the loop-level landing.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { KvRow, PanelHead, TonePill } from '../shared';
import { EffectiveConfigDrawer } from '../config/EffectiveConfigDrawer';
import { evidenceHref, responseHref } from '../cpaHref';
import { codeLabel } from '../vocabulary';
import { useAuthStore } from '../../../store/authStore';

const acquisitionText = (a: NonNullable<CpmLoop['model']>['acquisition'] | null | undefined): string => {
  if (!a) return '—';
  const parts = [a.mode];
  if (a.gridSeconds != null) parts.push(`${a.gridSeconds} s grid`);
  if (a.declaredScanS != null) parts.push(`declared scan ${a.declaredScanS} s`);
  if (a.sourceFilterS != null) parts.push(`source filter ${a.sourceFilterS} s`);
  return parts.join(' · ');
};

export const LoopModelCard: React.FC<{ loop: CpmLoop; workbenchHref?: string; workbenchTitle?: string }> = ({
  loop,
  workbenchHref = evidenceHref(loop.loopId, { kind: '12h' }),   // CHG-089: 12h default
  workbenchTitle = 'Open the newest window with run identity in the Evidence Workbench',
}) => {
  const navigate = useNavigate();
  const [showConfig, setShowConfig] = useState(false);
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const m = loop.model;
  const explicit = m?.classificationSource === 'EXPLICIT';
  return (
    <div>
      <PanelHead eyebrow="Context" title="Loop model"
        right={m ? <TonePill tone={explicit ? 'good' : 'muted'}>{explicit ? 'EXPLICIT' : 'PRESET'}</TonePill> : undefined} />
      {m ? (
        <>
          <KvRow label="Service family">{m.serviceFamily ?? '—'}</KvRow>
          <KvRow label="Dynamic class"><span title={m.dynamicClass ?? undefined}>{codeLabel(m.dynamicClass)}</span></KvRow>
          <KvRow label="Objective">{m.objectiveType}</KvRow>
          <KvRow label="Topology">{m.topology}</KvRow>
          <KvRow label="Command path"><span title={m.commandPath ?? undefined}>{codeLabel(m.commandPath)}</span></KvRow>
          <KvRow label="Acquisition">{acquisitionText(m.acquisition)}</KvRow>
          <p className="cpm-copy">
            {explicit
              ? 'Classification declared by a person in the registry; a tag-type preset never overwrites it.'
              : 'Classification derived from the tag type; declare it in the registry to make it explicit.'}
          </p>
        </>
      ) : (
        <p className="cpm-copy">Loop model not served by this registry; the engines run on the tag-type preset.</p>
      )}
      <KvRow label="Loop type">{loop.loopType}</KvRow>
      <KvRow label="Criticality">{loop.criticality}</KvRow>
      <div className="cpm-loop-model__links">
        <ObcButton variant="raised" title={workbenchTitle} onClick={() => navigate(workbenchHref)}>
          Evidence workbench ›
        </ObcButton>
        <ObcButton variant="normal" title={`Response events and system models of ${loop.loopId}`}
          onClick={() => navigate(responseHref(loop.loopId))}>
          System response ›
        </ObcButton>
        {/* CHG-081: the effective configuration is SuperAdmin only (cpm.config.read) */}
        {canReadConfig && <ObcButton variant="flat" onClick={() => setShowConfig(v => !v)}>{showConfig ? 'Hide effective configuration' : 'Effective configuration ›'}</ObcButton>}
      </div>
      {canReadConfig && showConfig && <EffectiveConfigDrawer loopId={loop.loopId} onClose={() => setShowConfig(false)} />}
    </div>
  );
};
