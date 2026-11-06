'use client';

/**
 * Explorer › Calculations › the long-diagnostics metrics of the latest fused window, moved here from the Summary
 * Calculations block. A metric the engine did not compute reads as its reason or a dash, never as 0.
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { KvRow } from '../shared';
import { LONG_METRICS, fmtVal } from '../windows/WindowResults';
import { contextOfMatrix, metricAvailability } from '../metricAvailability';
import { MetricValue } from '../MetricValue';

export const CalculationsMetrics: React.FC<{ matrix: CpmGateMatrix }> = ({ matrix }) => {
  const ctx = contextOfMatrix(matrix);
  const half = Math.ceil(LONG_METRICS.length / 2);
  const column = (items: typeof LONG_METRICS) => (
    <div>
      {items.map(x => (
        <KvRow key={x.field} label={x.label}>
          <MetricValue a={metricAvailability(ctx, x.field, matrix.metrics?.[x.field])} className="cpm-mono"
            text={fmtVal(matrix.metrics?.[x.field], x.pct)} />
        </KvRow>
      ))}
    </div>
  );
  return (
    <section className="cpm-gate-tier">
      <h3 className="cpm-gate-tier__label">Long-window metrics</h3>
      <div className="cpm-grid-2">
        {column(LONG_METRICS.slice(0, half))}
        {column(LONG_METRICS.slice(half))}
      </div>
    </section>
  );
};

export default CalculationsMetrics;
