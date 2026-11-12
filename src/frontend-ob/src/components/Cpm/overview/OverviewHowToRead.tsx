'use client';

/**
 * CHG-177 (owner answer 3): "How to read" for the Overview, top right beside 12h | 24h, as on every page redesigned since
 * CHG-156. Three titled parts: The cards (the page-foot Calculation basis sentence as four rows, in the served thresholds),
 * Loops requiring review (the order rule that was the queue title's ?, and where shelved loops are), The trend (the shaded-band
 * note that was the chart's ?). Each card's rule on hover and each drill-down's ? stay where they are.
 */
import React from 'react';
import type { FleetKpis } from '../../../api/cpm/fleetKpis';
import { Dialog } from '../../../ui/Dialog';
import { basisRows } from '../kpi/fleetKpiView';
import { BAND_MEANING } from '../trend/trendOption';
import { PRIORITY_ORDER, SHELVED_RULE } from './priorityReason';

interface Part { title: string; rows: Array<[term: string, meaning: string]> }

const parts = (kpis: FleetKpis | undefined): Part[] => [
  { title: 'The cards', rows: kpis ? basisRows(kpis) : [['Basis', 'It appears once the figures load.']] },
  { title: 'Loops requiring review', rows: [['Order', PRIORITY_ORDER], ['Shelved loops', SHELVED_RULE]] },
  { title: 'The trend', rows: [['Shaded band', BAND_MEANING]] },
];

export const OverviewHowToRead: React.FC<{ open: boolean; onClose: () => void; kpis: FleetKpis | undefined }> = ({ open, onClose, kpis }) => (
  <Dialog open={open} onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {parts(kpis).map(part => (
        <section key={part.title} className="cpm-howto__part" aria-label={part.title}>
          <h3 className="cpm-howto__title">{part.title}</h3>
          <dl className="cpm-howto__key">
            {part.rows.map(([term, meaning]) => (
              <div key={term} className="cpm-howto__row">
                <dt>{term}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  </Dialog>
);

export default OverviewHowToRead;
