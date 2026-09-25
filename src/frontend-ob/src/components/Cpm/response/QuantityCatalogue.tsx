/**
 * cpa-ui-fix-plan Phase 7 — the full quantity catalogue of a response event (52 rows on the lab)
 * as a wide, contained table in the centre column, opened on request from the context column.
 * Lazily loaded; renders only what the event detail already holds (no fetch). Not-applicable rows
 * stay listed and muted, with their reason, never as 0.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead } from '../shared';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { quantityText } from './responseSupport';

export const QuantityCatalogue: React.FC<{ metrics: ResponseQuantity[]; onClose: () => void }> = ({ metrics, onClose }) => {
  const applicable = metrics.filter(q => q.value != null).length;
  return (
    <section className="cpm-surface" aria-label="All quantities of the catalogue">
      <PanelHead eyebrow="Quantities" title={`All ${metrics.length} quantities · ${applicable} reported, ${metrics.length - applicable} not applicable`}
        right={<ObcButton variant="flat" title="Hide the catalogue" onClick={onClose}>Close</ObcButton>} />
      <div className="cpm-table-wrap">
        <table className="cpm-table" data-table="quantities-all">
          <thead><tr><th>quantity</th><th>value</th><th>unit</th><th>method</th><th>path</th><th>support</th></tr></thead>
          <tbody>
            {metrics.map(q => (
              <tr key={q.quantityId} data-applicable={q.value != null} className={q.value == null ? 'cpm-row--muted' : undefined}>
                <td className="cpm-mono cpm-wrap">{q.quantityId}</td>
                <td className="cpm-nowrap">{quantityText(q)}</td>
                <td className="cpm-mono">{q.value != null ? q.unit || '—' : '—'}</td>
                <td className="cpm-mono cpm-wrap">{q.method || '—'}</td>
                <td className="cpm-mono cpm-wrap">{q.pathId || '—'}</td>
                <td className="cpm-mono cpm-nowrap">{q.supportFromMs != null && q.supportToMs != null ? `${Math.round((q.supportToMs - q.supportFromMs) / 1000)} s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default QuantityCatalogue;
