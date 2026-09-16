/**
 * v2.5 Task 2E.2: the replay's input lineage strip, split out of CpmReplay - where the evidence
 * came from: the historian series, the normalise grid and topic, the gate tier and its role (from
 * the served catalogue, never a client-side table), the fused verdict.
 */
import React from 'react';
import { PanelHead } from '../shared';

export const LineageStrip: React.FC<{
  series: string | undefined;
  gridS: number | null;
  gateKey: string;
  role: string;
  diagnosis: string | null | undefined;
}> = ({ series, gridS, gateKey, role, diagnosis }) => (
  <>
    <PanelHead eyebrow="Input lineage" title="Where this evidence came from" />
    <div className="cpm-lineage">
      <div className="cpm-lineage__node">
        <span className="cpm-eyebrow">IoTDB raw</span>
        <span className="cpm-mono">{series ?? '—'}</span>
      </div>
      <span className="cpm-lineage__arrow">→</span>
      <div className="cpm-lineage__node">
        <span className="cpm-eyebrow">Normalize</span>
        <span>{gridS != null ? `${gridS % 1 === 0 ? gridS : gridS.toFixed(1)} s grid` : 'engine grid'} · traverse.cpa.loop.samples.v1</span>
      </div>
      <span className="cpm-lineage__arrow">→</span>
      <div className="cpm-lineage__node">
        <span className="cpm-eyebrow">Gate tier</span>
        <span>{gateKey} · {role}</span>
      </div>
      <span className="cpm-lineage__arrow">→</span>
      <div className="cpm-lineage__node">
        <span className="cpm-eyebrow">Fused verdict</span>
        <span>{(diagnosis ?? '—').replace(/_/g, ' ')}</span>
      </div>
    </div>
  </>
);
