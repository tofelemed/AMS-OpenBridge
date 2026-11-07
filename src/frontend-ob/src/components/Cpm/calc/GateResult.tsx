/**
 * Task 20: the result of the gate that judges a metric. When the metric itself has no value the gate may still have judged
 * the window on other inputs, so the word is muted and says so: it is never a pass for a number that does not exist.
 */
import React from 'react';
import { GateBadge } from '../../../ui/GateBadge';
import { TonePill } from '../shared';
import type { MetricView } from './calcView';

export const GateResult: React.FC<{ gate: string; status: MetricView['status'] }> = ({ gate, status }) =>
  status.partial
    ? <TonePill tone="muted">{status.label} on other inputs</TonePill>
    : <GateBadge status={status.code} gate={gate} />;

export default GateResult;
