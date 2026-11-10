'use client';

/**
 * Explorer › Calculations › the latest fused window's gates, grouped by tier, one compact row each: the gate, then its
 * status (the shared gate mark, `GateBadge`, so it reads exactly as on the Summary tiles) at the end. CHG-158 (the owner's
 * image): no Inspect column; the gate's name opens it in the shared dialog.
 */
import React, { useMemo } from 'react';
import type { CpmGateCell } from '../../../api/cpm/gates';
import { GateBadge } from '../../../ui/GateBadge';
import { buildTierGroups } from '../gateStatus';

export const CalculationsGateTable: React.FC<{
  cells: CpmGateCell[];
  flags?: readonly string[] | null;
  onInspect: (gate: string) => void;
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
          <tr><th scope="colgroup" colSpan={2}>{tier.label}</th></tr>
          {tier.cells.map(g => (
            <tr key={g.key}>
              <th scope="row">
                <button type="button" className="cpm-explorer-gates__name" title={`Inspect ${g.key}`} onClick={() => onInspect(g.key)}>
                  {g.key} · {g.name}
                </button>
              </th>
              <td><GateBadge status={g.status} gate={g.key} inputFlags={flags} /></td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
};

export default CalculationsGateTable;
