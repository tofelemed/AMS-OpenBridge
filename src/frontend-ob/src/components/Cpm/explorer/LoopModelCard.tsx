/**
 * The loop as the engines see it, in a dialog from "Loop model & setup →" on Summary: the v2.5 loop-model dimensions (2G.1) with
 * where the classification came from, the acquisition contract that bounds the methods, the gate profile and the historian
 * device. Onward: Loop Registry → (where it is changed) and System Response ↗. The Workbench button went; Review evidence → in
 * the band is the way there.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { loopSeries } from '../../../utils/loopSeries';
import { KvRow } from '../shared';
import { EffectiveConfigDrawer } from '../config/EffectiveConfigDrawer';
import { registryHref, responseHref } from '../cpaHref';
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

export const LoopModelCard: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const [showConfig, setShowConfig] = useState(false);
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const m = loop.model;
  const explicit = m?.classificationSource === 'EXPLICIT';
  return (
    <div>
      {m ? (
        <>
          <KvRow label="Classification">
            {explicit ? 'Declared' : 'From tag type'}{' '}
            <Toggletip variant="how-to" label="How this is classified">
              <p>
                {explicit
                  ? 'Classification declared by a person in the registry; a tag-type preset never overwrites it.'
                  : 'Classification derived from the tag type; declare it in the registry to make it explicit.'}
              </p>
            </Toggletip>
          </KvRow>
          <KvRow label="Service family">{m.serviceFamily ?? '—'}</KvRow>
          <KvRow label="Dynamic class"><span title={m.dynamicClass ?? undefined}>{codeLabel(m.dynamicClass)}</span></KvRow>
          <KvRow label="Objective">{m.objectiveType}</KvRow>
          <KvRow label="Topology">{m.topology}</KvRow>
          <KvRow label="Command path"><span title={m.commandPath ?? undefined}>{codeLabel(m.commandPath)}</span></KvRow>
          <KvRow label="Acquisition">{acquisitionText(m.acquisition)}</KvRow>
        </>
      ) : (
        <p className="cpm-copy">Loop model not served by this registry; the engines run on the tag-type preset.</p>
      )}
      <KvRow label="Loop type">{loop.loopType}</KvRow>
      <KvRow label="Criticality">{loop.criticality}</KvRow>
      <KvRow label="Gate profile">{loop.thresholdProfileId ?? 'default'}</KvRow>
      <KvRow label="Historian device">{loopSeries(loop.loopId)}</KvRow>
      {/* CHG-081: the effective configuration is SuperAdmin only (cpm.config.read) */}
      {canReadConfig && (
        <div className="cpm-loop-model__links">
          <ObcButton variant="flat" onClick={() => setShowConfig(v => !v)}>{showConfig ? 'Hide effective configuration' : 'Show effective configuration'}</ObcButton>
        </div>
      )}
      {canReadConfig && showConfig && <EffectiveConfigDrawer loopId={loop.loopId} onClose={() => setShowConfig(false)} />}
    </div>
  );
};

/** The Summary's entry to the loop model: one flat button, and the dialog it opens. */
export const LoopModelLink: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ObcButton variant="flat" onClick={() => setOpen(true)}>Loop model & setup →</ObcButton>
      {createPortal(
        <Dialog open={open} onClose={() => setOpen(false)} title={`${loop.loopId} · Loop model & setup`}
          footer={(
            <>
              <ObcButton variant="flat" title={`Response events and system models of ${loop.loopId}`} onClick={() => navigate(responseHref(loop.loopId))}>
                System Response ↗
              </ObcButton>
              <ObcButton variant="raised" onClick={() => navigate(registryHref(loop.loopId))}>Loop Registry →</ObcButton>
            </>
          )}>
          <LoopModelCard loop={loop} />
        </Dialog>,
        document.body,
      )}
    </>
  );
};

export default LoopModelCard;
