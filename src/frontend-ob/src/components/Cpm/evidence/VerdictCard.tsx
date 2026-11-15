/**
 * v2.5 workbench: the answer first, under the gate's head. CHG-187 (owner review 11.2): the gate's key numbers are KPI cards
 * (title, value with its unit, ? tip), each fact said once. The sentence above them went: its status is the head's mark, its
 * numbers are the cards, and what it added - a limit on the claim ("Limited by the 5 s acquisition grid") - stays as a small
 * flag. Draws nothing when there is neither.
 */
import React from 'react';
import { KpiCard } from '../kpi/KpiCard';
import { StatusBadge } from '../../../ui/StatusBadge';
import type { Headline } from './views/headlines';

export interface VerdictCardProps {
  /** Limits on the gate's claim, as short phrases. */
  flags: string[];
  headline: Headline[];
}

/** A number keeps the card's figure size; a word or a phrase reads at text size (the app's own rule for a value that is not a number). */
const valueOf = (h: Headline) => {
  const text = h.unit ? `${h.value} ${h.unit}` : h.value;
  return /^[-+]?[\d.,]+(\s|$)/.test(h.value) ? text : <span className="cpm-kpicard__text">{text}</span>;
};

export const VerdictCard: React.FC<VerdictCardProps> = ({ flags, headline }) => {
  if (flags.length === 0 && headline.length === 0) return null;
  return (
    <div className="cpm-verdict cpm-verdict--body" role="region" aria-label="Verdict">
      {flags.length > 0 && (
        <div className="cpm-verdict__flags">
          {flags.map(f => <StatusBadge key={f} tone="neutral">{f}</StatusBadge>)}
        </div>
      )}
      {headline.length > 0 && (
        <div className="cpm-verdict__tiles">
          {headline.map(h => <KpiCard key={h.label} headed label={h.label} value={valueOf(h)} tip={h.tip ? <p>{h.tip}</p> : undefined} />)}
        </div>
      )}
    </div>
  );
};

export default VerdictCard;
