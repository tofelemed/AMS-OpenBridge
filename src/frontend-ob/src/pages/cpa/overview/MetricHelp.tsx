/** A registry ⓘ with its placeholders filled from the served basis (UI-037). */
import React from 'react';
import type { FleetKpiBasis } from '../../../api/cpm/fleetKpis';
import { Toggletip } from '../../../ui/Toggletip';
import { helpValues } from './helpFill';

export const MetricHelp: React.FC<{
  metric: string;
  label?: string;
  basis?: FleetKpiBasis;
  /** The `?metric=` value when a CPLM id is known. */
  calculation?: string;
  extra?: Record<string, string>;
}> = ({ metric, label, basis, calculation, extra }) => (
  <Toggletip metric={metric} label={label} calculation={calculation} values={helpValues(basis, extra)} />
);
