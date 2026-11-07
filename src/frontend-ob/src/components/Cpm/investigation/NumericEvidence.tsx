/**
 * CHG-141: one value from the window's measures; every measure opens in a dialog. Good-error time is on the result card,
 * so it is not repeated here. `numericHeadline` chooses, and missing stays missing.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Toggletip } from '../../../ui/Toggletip';
import { KpiTile, PanelHead } from '../shared';
import { numericHeadline } from './keyFacts';

export const NumericEvidence: React.FC<{ matrix: CpmGateMatrix; onOpen: () => void }> = ({ matrix, onOpen }) => {
  const lead = numericHeadline(matrix, matrix.metrics ?? {});
  return (
    <section className="cpm-surface" aria-label="Numeric evidence">
      <PanelHead title="Numeric evidence"
        help={<Toggletip variant="how-to" label="About numeric evidence"><p>The measures stored on this window. A value the engine did not qualify shows why, never 0.</p></Toggletip>} />
      <div className="cpm-inv-numeric">
        {lead.kind === 'value' && <KpiTile caption={lead.label} value={lead.value} />}
        {lead.kind === 'state' && <p className="cpm-copy"><strong>{lead.short}.</strong> {lead.reason}.</p>}
        {lead.kind === 'none' && <p className="cpm-metric-na">No other measure on this window.</p>}
        <ObcButton variant="flat" onClick={onOpen}>View all measures →</ObcButton>
      </div>
    </section>
  );
};

export default NumericEvidence;
