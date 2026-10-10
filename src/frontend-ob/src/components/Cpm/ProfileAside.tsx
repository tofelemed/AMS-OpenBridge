'use client';

/**
 * Registry detail aside: assigned profile, observability flags and the
 * gate-role policy for the selected loop.
 */
'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry.
 * CPA-prototype IA parity: registry table + profile detail aside + 5-step
 * add-loop wizard + bulk CSV import, wired to the real onboarding API.
 * The prototype's "draft" concept maps to our immediate activate + readiness
 * report (the wizard shows readiness as its post-save validation step).
 */
import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill } from './shared';
import { EffectiveConfigDrawer } from './config/EffectiveConfigDrawer';
import { useGateCatalogue, useRepublishEvidence } from '../../hooks/useCpm';
import type { GateCatalogue } from '../../api/cpm/catalogue';
import type { CpmLoop } from '../../api/cpmApi';

import { modelLabel, stateOf } from './registryShared';
import { CodeLabel } from './CodeLabel';
import { peerDetail, vpDetail } from './optionalInputs';
import { flagsForLoop, inputContextOf } from './optionalInputs';

// ── profile detail aside ───────────────────────────────────────────────────

const ROLE_ORDER = ['BLOCKING', 'ELIGIBILITY', 'PERFORMANCE', 'PRIMARY', 'SUPPORTING', 'CONTEXT', 'CONFIRMATION', 'FUSION'];

/** v2.5 (2D.1 / 2E.3): the role policy is the BUILD's gate catalogue, grouped by role - never a client-side table. */
export function rolePolicyOf(catalogue: GateCatalogue | undefined): [string, string][] {
  if (!catalogue) return [];
  return ROLE_ORDER.map(role => [role, catalogue.gates.filter(g => g.role === role).map(g => g.gate).join(' · ')] as [string, string])
    .filter(([, gates]) => gates.length > 0);
}

export const ProfileAside: React.FC<{ loop: CpmLoop; onEdit: () => void }> = ({ loop, onEdit }) => {
  const [showConfig, setShowConfig] = useState(false);
  const republish = useRepublishEvidence();
  const catalogue = useGateCatalogue();
  const rolePolicy = rolePolicyOf(catalogue.data);
  const st = stateOf(loop);
  return (
    <aside className="cpm-surface">
      <PanelHead
        eyebrow="Assigned profile"
        title={loop.loopId}
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <TonePill tone={st.tone}>{st.label.toUpperCase()}</TonePill>
            <ObcButton variant="normal" onClick={onEdit}>Edit loop</ObcButton>
          </span>
        }
      />
      {/* v2.5 (2G.1): the registry's stored model with its source - never a client-side
          derivation from the tag type. The engine resolves its profile from this. */}
      <KvRow label="Loop model">
        {modelLabel(loop)} <span className="cpm-event-row__sub">({loop.model?.classificationSource === 'EXPLICIT' ? 'declared' : 'preset from loop type'})</span>
      </KvRow>
      {loop.model && (
        <KvRow label="Objective / topology / command">{loop.model.objectiveType} · {loop.model.topology} · {loop.model.commandPath}</KvRow>
      )}
      {loop.model?.acquisition && (
        <KvRow label="Acquisition">{loop.model.acquisition.mode}{loop.model.acquisition.gridSeconds != null ? ` · grid ${loop.model.acquisition.gridSeconds} s` : ' · grid undeclared'}</KvRow>
      )}
      <KvRow label="Loop type">{loop.loopType}</KvRow>
      <KvRow label="Site / area / unit">
        {[loop.site, loop.area, loop.unit].filter(Boolean).join(' / ')}
        {/* Reverse hop of the tree's CPM badge — the projection puts this loop's
            Device + signal assets under its unit. Only rendered for users who
            can actually reach Administration (asset.edit gates /admin). */}
        {useAuthStore.getState().hasPermission('asset.edit') && (
          <>
            {' '}
            <RouterLink
              to={`/admin/plant-model?search=${encodeURIComponent(loop.loopId.toLowerCase())}`}
              className="cpm-pill cpm-pill--muted"
              style={{ textDecoration: 'none', marginLeft: 6 }}
              title="Open this loop's device and signal assets in the plant model tree"
            >
              View in plant tree ↗
            </RouterLink>
          </>
        )}
      </KvRow>
      <KvRow label="Criticality">{loop.criticality}</KvRow>
      <KvRow label="Valve position">{loop.tags['VP'] ?? vpDetail(loop)}</KvRow>
      <KvRow label="Peer links">
        {loop.links.length > 0
          ? loop.links.map(l => `${l.relType} → ${l.toLoopId}`).join(', ')
          : peerDetail(loop)}
      </KvRow>
      <KvRow label="Gate profile">{loop.thresholdProfileId ?? 'default'}</KvRow>
      <KvRow label="Observability">
        {flagsForLoop(loop.observabilityFlags, inputContextOf(loop)).length > 0
          ? flagsForLoop(loop.observabilityFlags, inputContextOf(loop)).map(f => <TonePill key={f} tone="warn"><CodeLabel code={f} /></TonePill>)
          : <TonePill tone="good">CLEAR</TonePill>}
      </KvRow>

      {/* v2.5 (audit F21): the governed configuration this loop runs under, read-only, from the registry as well */}
      <div className="cpm-loop-model__links">
        <ObcButton variant="flat" onClick={() => setShowConfig(v => !v)}>{showConfig ? 'Hide effective configuration' : 'Effective configuration ›'}</ObcButton>
        <RouterLink className="cpm-link" to={`/cpm/evidence?loop=${encodeURIComponent(loop.loopId)}`}>Evidence workbench ›</RouterLink>
      </div>
      {showConfig && <EffectiveConfigDrawer loopId={loop.loopId} onClose={() => setShowConfig(false)} />}

      <PanelHead eyebrow="Gate role policy" title="Roles per gate" />
      {rolePolicy.length === 0 && <p className="cpm-copy">{catalogue.isError ? 'Gate catalogue unavailable.' : 'Loading the gate catalogue…'}</p>}
      {rolePolicy.map(([role, gates]) => (
        <KvRow key={role} label={role}>{gates}</KvRow>
      ))}
      <p className="cpm-copy" style={{ marginTop: 8 }}>
        G9 geometry is supporting-only. It cannot create a stiction suspect without
        qualified independent evidence.
      </p>

      <div style={{ marginTop: 12 }}>
        <ObcButton
          variant="normal"
          disabled={republish.isPending}
          onClick={() => republish.mutate(loop.loopId)}
        >
          {republish.isPending ? 'Republishing…' : 'Re-project links & republish evidence'}
        </ObcButton>
        {republish.isSuccess && (
          <p className="cpm-copy">
            Republished — {republish.data.links} link(s) live on the broadcast
            {typeof republish.data.signalAssets === 'number'
              ? `, ${republish.data.signalAssets} signal asset(s) projected into the UNS`
              : ''}.
          </p>
        )}
      </div>
    </aside>
  );
};

export default ProfileAside;
