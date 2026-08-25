'use client';

/**
 * Explorer › Relationships. Lineage strip plus the G13 peer topology.
 *
 * The empty state no longer restates the consequence the workspace banner
 * already states — it gives the action instead, which is what was missing.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmCalculations, useLatestGates } from '../../../hooks/useCpm';
import { EmptyState, KvRow, PanelHead } from '../shared';

export const RelationshipsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
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
  const latest = useLatestGates(loop.loopId, '24h');
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
      <PanelHead eyebrow="Lineage" title="Source → loop → calculations → outputs" />
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

      <PanelHead
        eyebrow="Peer topology (G13)"
        title={loop.links.length ? `${loop.links.length} loop link(s)` : 'Loop links'}
      />
      {loop.links.length === 0 && (
        <EmptyState
          title="No peer links"
          copy="Create asset relationships, then republish evidence — G13 cannot evaluate without them."
          action={{
            label: 'Open in Loop Registry',
            onClick: () => navigate(`/cpm/registry?loop=${encodeURIComponent(loop.loopId)}`),
          }}
        />
      )}
      {loop.links.map(l => (
        <KvRow key={`${l.relType}-${l.toLoopId}`} label={l.relType}>
          {l.toLoopId} <span className="cpm-event-row__sub">({l.origin})</span>
        </KvRow>
      ))}
    </div>
  );
};

export default RelationshipsTab;
