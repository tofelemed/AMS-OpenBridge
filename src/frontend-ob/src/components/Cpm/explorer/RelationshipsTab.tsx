'use client';

/**
 * Explorer › Relationships. The loops this one is linked to (G13 peer topology), each opening that loop's own
 * Relationships tab, then the lineage in a disclosure that starts closed. What G13 needs is behind the ?, and the
 * empty state gives the action instead of restating the consequence the workspace banner already states.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmCalculations, useLatestGates } from '../../../hooks/useCpm';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow, PanelHead } from '../shared';
import { explorerHref, registryHref } from '../cpaHref';

/** `windowKind`: the Explorer's fused window (CHG-089, 12h default). */
export const RelationshipsTab: React.FC<{ loop: CpmLoop; windowKind?: string }> = ({ loop, windowKind = '12h' }) => {
  const navigate = useNavigate();
  // The gate count was hardcoded as "17 gates". The catalogue endpoint reports
  // what the engine actually computes (and which gates have been observed in
  // stored results), so a pack change can no longer leave this text lying.
  const calc = useCpmCalculations();
  const gates = calc.data?.gates ?? [];
  const observed = gates.filter(g => g.observedInResults).length;
  const gatesSub = gates.length
    ? `${gates.length} gates (${observed} observed) · ${calc.data?.engine ?? 'Flink'}`
    : 'gate catalogue unavailable';

  // Evidence node: name the stores this loop's evidence actually lands in, and
  // the calculation version that produced the latest verdict.
  const latest = useLatestGates(loop.loopId, windowKind);
  const version = latest.data?.metadata.calculationVersion;

  const nodes = [
    { title: 'UNS signals', sub: Object.keys(loop.tags).join(' · ') || 'none mapped' },
    {
      title: loop.loopId,
      sub: [loop.loopType, loop.criticality].filter(Boolean).join(' · ') || 'Control loop',
    },
    { title: 'CPLM pack', sub: gatesSub },
    {
      title: 'Evidence',
      sub: version
        ? `Gate results · event frames · KPI series · calc ${version}`
        : 'Gate results · event frames · KPI series',
    },
  ];

  return (
    <div>
      <PanelHead
        title="Loop links"
        help={(
          <Toggletip variant="how-to" label="Peer topology (G13)">
            <p>Create asset relationships, then republish evidence — G13 cannot evaluate without them.</p>
          </Toggletip>
        )}
      />
      {loop.links.length === 0 && (
        <div className="cpm-empty">
          <h3>No peer links</h3>
          <div className="cpm-empty__next">
            <ObcButton variant="flat" onClick={() => navigate(registryHref(loop.loopId))}>Loop Registry →</ObcButton>
          </div>
        </div>
      )}
      {loop.links.map(l => (
        <KvRow key={`${l.relType}-${l.toLoopId}`} label={l.relType}>
          {/* The linked loop's own Relationships tab, so the topology can be walked loop by loop. */}
          <ObcButton variant="flat" onClick={() => navigate(explorerHref(l.toLoopId, { tab: 'Relationships' }))}>
            {l.toLoopId}
          </ObcButton>{' '}
          <span className="cpm-event-row__sub">({l.origin})</span>
        </KvRow>
      ))}

      <details className="cpm-gate-more">
        <summary>Lineage</summary>
        <div className="cpm-lineage">
          {nodes.map((n, i) => (
            <React.Fragment key={n.title}>
              <div className="cpm-lineage__node">
                <strong>{n.title}</strong>
                <span className="cpm-event-row__sub">{n.sub}</span>
              </div>
              {i < nodes.length - 1 && <span className="cpm-lineage__arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
      </details>
    </div>
  );
};

export default RelationshipsTab;
