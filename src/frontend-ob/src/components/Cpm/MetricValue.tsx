/**
 * SME review #17 (CHG-053): a metric cell that never dresses a missing calculation as a number. Measured →
 * the formatted value (a measured 0 stays "0"); otherwise the status in grey with its reason on hover —
 * "Not calculated", "Not qualified", "Insufficient data", "N/A".
 */
import React from 'react';
import type { MetricAvailability } from './metricAvailability';

export const MetricValue: React.FC<{ a: MetricAvailability; text: string; className?: string }> = ({ a, text, className }) =>
  a.state === 'measured'
    ? <span className={className}>{text}</span>
    : <span className="cpm-metric-na" data-state={a.state} title={a.reason ?? undefined}>{a.short}</span>;

export default MetricValue;
