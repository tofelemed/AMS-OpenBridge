/**
 * CHG-132: how a KPI is calculated, behind its ?. The page shows the number and its loops; the rule, formula, threshold,
 * basis, reason for the KPI, time computed and change since 24 h ago are all here, in one place.
 */
import React from 'react';
import type { FleetKpiFigure, FleetKpis } from '../../../api/cpm/fleetKpis';
import { Toggletip } from '../../../ui/Toggletip';
import { fmtDateTime } from '../shared';
import { basisShort, type KpiDelta, type KpiMeta } from './kpiMeta';

export const KpiCalculation: React.FC<{
  figure: FleetKpiFigure | null;
  meta: KpiMeta | undefined;
  why: string | undefined;
  kpis: FleetKpis;
  delta: KpiDelta | null;
}> = ({ figure, meta, why, kpis, delta }) => {
  const fields: Array<[string, React.ReactNode]> = [
    ['Rule', figure && `${figure.rule}.`],
    ['Formula', meta && <code className="cpm-kpi-proof__formula">{meta.formula}</code>],
    ['Threshold', meta?.threshold(kpis.basis)],
    ['Basis', basisShort(kpis.basis)],
    ['Why this KPI', why],
    ['Computed', fmtDateTime(kpis.computedAt)],
    ['Since 24 h ago', delta?.since],
  ];
  return (
    <Toggletip variant="how-to" label="How this number is calculated">
      <dl className="ui-toggletip__fields">
        {fields.filter(([, value]) => value).map(([term, value]) => (
          <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </Toggletip>
  );
};

export default KpiCalculation;
