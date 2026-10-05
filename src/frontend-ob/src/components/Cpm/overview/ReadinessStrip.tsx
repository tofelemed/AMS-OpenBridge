/**
 * SME review #5 (CHG-043): configuration limits in their own readiness section,
 * below the operating picture and in neutral styling. Missing positioner feedback
 * and unconfigured peers limit what the engine can CONFIRM; they are not loop
 * problems, so they no longer take half the headline tiles in caution yellow.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { PanelHead } from '../shared';
import { peersCopy, positionerCopy } from './capabilityCopy';

export const ReadinessStrip: React.FC<{ summary: CpmFleetSummary | undefined }> = ({ summary }) => {
  const navigate = useNavigate();
  if (!summary) return null;
  const noVp = summary.capability.loopsCappedByMissingVp;
  const noPeers = summary.capability.loopsWithoutDisturbanceContext;
  const items = [
    { count: noVp, ...positionerCopy(noVp) },
    { count: noPeers, ...peersCopy(noPeers) },
  ];
  return (
    <section className="cpm-surface cpm-readiness" aria-label="Readiness: configuration limits">
      <PanelHead eyebrow="Readiness" title="Configuration limits"
        right={
          <ObcButton variant="flat" title="Map signals and configure peers per loop in the Loop Registry"
            onClick={() => navigate('/cpm/registry')}>
            Open Loop Registry ›
          </ObcButton>
        } />
      <ul className="cpm-readiness__list">
        {items.map(i => (
          <li key={i.caption}>
            <strong>{i.count}</strong> {i.caption.toLowerCase()}
            <span className="cpm-op__muted"> · {i.sub}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ReadinessStrip;
