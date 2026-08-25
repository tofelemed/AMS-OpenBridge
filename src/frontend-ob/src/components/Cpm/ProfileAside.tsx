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
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill } from './shared';
import { useRepublishEvidence } from '../../hooks/useCpm';
import type { CpmLoop } from '../../api/cpmApi';

import { dynamicClassOf, stateOf } from './registryShared';

// ── profile detail aside ───────────────────────────────────────────────────

const GATE_ROLE_POLICY: [string, string][] = [
  ['BLOCKING', 'G0 · G1 · G11'],
  ['ELIGIBILITY', 'G2 · G2r'],
  ['PERFORMANCE', 'G3 · G4'],
  ['PRIMARY', 'G5 · G6 · G10'],
  ['SUPPORTING', 'G7 · G8 · G9'],
  ['CONTEXT', 'G12 · G13'],
  ['CONFIRMATION', 'G14'],
  ['FUSION', 'G15'],
];

export const ProfileAside: React.FC<{ loop: CpmLoop; onEdit: () => void }> = ({ loop, onEdit }) => {
  const republish = useRepublishEvidence();
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
      {/* Derived from loop type here; the engine resolves its own dynamicsClass
          per window (and reports whether the profile was INFERRED), which the
          Explorer Summary tab shows. Naming the derivation stops this reading as
          the engine's answer. */}
      <KvRow label="Dynamic class">
        {dynamicClassOf(loop)} <span className="cpm-event-row__sub">(derived from loop type)</span>
      </KvRow>
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
      <KvRow label="Valve position">{loop.tags['VP'] ?? 'Not mapped — confidence capped at 0.89'}</KvRow>
      <KvRow label="Peer links">
        {loop.links.length > 0
          ? loop.links.map(l => `${l.relType} → ${l.toLoopId}`).join(', ')
          : 'None — G13 not evaluated'}
      </KvRow>
      <KvRow label="Gate profile">{loop.thresholdProfileId ?? 'default'}</KvRow>
      <KvRow label="Observability">
        {loop.observabilityFlags.length > 0
          ? loop.observabilityFlags.map(f => <TonePill key={f} tone="warn">{f}</TonePill>)
          : <TonePill tone="good">CLEAR</TonePill>}
      </KvRow>

      <PanelHead eyebrow="Gate role policy" title="Roles per gate" />
      {GATE_ROLE_POLICY.map(([role, gates]) => (
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
