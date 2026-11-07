/**
 * Every measure of Numeric evidence, in its dialog. CHG-129: when every fact has the same answer, one line names them all, so six
 * identical tiles do not push the evidence off the screen. The tiles return as soon as any value differs.
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { KpiTile } from '../shared';
import MetricValue from '../MetricValue';
import { contextOfMatrix, metricAvailability, type MetricAvailability } from '../metricAvailability';
import { KEY_FACTS, fmtFact } from './keyFacts';

export const KeyFacts: React.FC<{ matrix: CpmGateMatrix; metrics: Record<string, number | undefined> }> = ({ matrix, metrics }) => {
  // CHG-053: a placeholder 0 (method did not qualify) or a value from an excluded window is not a fact
  const facts: Array<{ f: (typeof KEY_FACTS)[number]; a: MetricAvailability }> = KEY_FACTS.map(f => ({
    f, a: metricAvailability(contextOfMatrix(matrix), f.field, metrics[f.field]),
  }));
  const first = facts[0]?.a;
  const allSame = !!first && first.state !== 'measured' && facts.every(x => x.a.state === first.state && x.a.reason === first.reason);

  if (allSame) {
    return (
      <p className="cpm-copy">
        <strong>{first.short}.</strong> {first.reason ? `${first.reason[0].toUpperCase()}${first.reason.slice(1)} for: ` : 'For: '}
        {facts.map(x => x.f.label).join(', ')}.
      </p>
    );
  }
  return (
    <div className="cpm-kpi-row">
      {facts.map(({ f, a }) => (
        <KpiTile key={f.field} caption={f.label} tone="muted"
          value={<MetricValue a={a} text={fmtFact(f, (metrics[f.field] ?? 0) * (f.scale ?? 1))} />}
          sub={a.reason ?? undefined} />
      ))}
    </div>
  );
};

export default KeyFacts;
