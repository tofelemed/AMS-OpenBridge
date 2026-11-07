'use client';

/**
 * The gate role policy: the build's gate catalogue grouped by role. Moved unchanged from the old registry aside;
 * Task 25 moves it on to Gate Configuration. The G9 caution is behind the ?.
 */
import React from 'react';
import { Toggletip } from '../../../ui/Toggletip';
import { useGateCatalogue } from '../../../hooks/useCpm';
import type { GateCatalogue } from '../../../api/cpm/catalogue';
import { KvRow, PanelHead } from '../shared';

const ROLE_ORDER = ['BLOCKING', 'ELIGIBILITY', 'PERFORMANCE', 'PRIMARY', 'SUPPORTING', 'CONTEXT', 'CONFIRMATION', 'FUSION'];

/** v2.5 (2D.1 / 2E.3): the role policy is the BUILD's gate catalogue, grouped by role - never a client-side table. */
export function rolePolicyOf(catalogue: GateCatalogue | undefined): [string, string][] {
  if (!catalogue) return [];
  return ROLE_ORDER.map(role => [role, catalogue.gates.filter(g => g.role === role).map(g => g.gate).join(' · ')] as [string, string])
    .filter(([, gates]) => gates.length > 0);
}

export const GateRolePolicy: React.FC = () => {
  const catalogue = useGateCatalogue();
  const rolePolicy = rolePolicyOf(catalogue.data);
  return (
    <>
      <PanelHead
        eyebrow="Gate role policy"
        title="Roles per gate"
        help={(
          <Toggletip variant="how-to" label="Gate role policy">
            <p>G9 geometry is supporting-only. It cannot create a stiction suspect without qualified independent evidence.</p>
          </Toggletip>
        )}
      />
      {rolePolicy.length === 0 && <p className="cpm-copy">{catalogue.isError ? 'Gate catalogue unavailable.' : 'Loading the gate catalogue…'}</p>}
      {rolePolicy.map(([role, gates]) => (
        <KvRow key={role} label={role}>{gates}</KvRow>
      ))}
    </>
  );
};

export default GateRolePolicy;
