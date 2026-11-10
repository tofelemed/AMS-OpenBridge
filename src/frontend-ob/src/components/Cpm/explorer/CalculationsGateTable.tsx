'use client';

/**
 * Explorer › Calculations › the latest fused window's gates, grouped by tier. The status is the shared gate mark
 * (`GateBadge`), so a gate reads exactly as on the Summary tiles. Inspect → opens the gate in the shared dialog; a short
 * window's checks have no gate dialog, so they come without it (CHG-158).
 */
import React, { useMemo } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateCell } from '../../../api/cpm/gates';
import { GateBadge } from '../../../ui/GateBadge';
import { buildTierGroups } from '../gateStatus';

export const CalculationsGateTable: React.FC<{
  cells: CpmGateCell[];
  flags?: readonly string[] | null;
  onInspect?: (gate: string) => void;
}> = ({ cells, flags, onInspect }) => {
  const tiers = useMemo(() => {
    const byKey = new Map(cells.map(c => [c.key, c]));
    return buildTierGroups(cells.map(c => c.key))
      .map(g => ({ label: g.label, cells: g.keys.map(k => byKey.get(k)!).filter(Boolean) }))
      .filter(g => g.cells.length > 0);
  }, [cells]);

  return (
    <table className="cpm-table cpm-explorer-gates">
      {tiers.map(tier => (
        <tbody key={tier.label}>
          <tr><th scope="colgroup" colSpan={onInspect ? 3 : 2}>{tier.label}</th></tr>
          {tier.cells.map(g => (
            <tr key={g.key}>
              <th scope="row">{g.key} · {g.name}</th>
              <td><GateBadge status={g.status} gate={g.key} inputFlags={flags} /></td>
              {onInspect && <td><ObcButton variant="flat" onClick={() => onInspect(g.key)}>Inspect →</ObcButton></td>}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
};

export default CalculationsGateTable;
