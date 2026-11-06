/**
 * Gates under their tier headings: one row of tiles that wraps by tier. The page says what a tile is, so
 * the same row serves counts on Performance and marks on Loop Explorer.
 */
import React from 'react';
import { buildTierGroups } from '../gateStatus';

export const GateTierRow: React.FC<{
  gates: string[];
  tile: (gate: string) => React.ReactNode;
}> = ({ gates, tile }) => (
  <div className="cpm-tier-row">
    {buildTierGroups(gates).map(tier => (
      <div key={tier.label} role="group" aria-label={tier.label} className="cpm-tier-row__tier">
        <h3 className="cpm-tier-row__name">{tier.label}</h3>
        <div className="cpm-tier-row__tiles">
          {tier.keys.map(gate => <React.Fragment key={gate}>{tile(gate)}</React.Fragment>)}
        </div>
      </div>
    ))}
  </div>
);

export default GateTierRow;
