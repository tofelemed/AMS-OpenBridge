import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

// ---- Domain Models ----
export interface CausalNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: 'ROOT_CAUSE' | 'CORRELATED_ALARM' | 'SUPPRESSED_ALARM';
  priority: string;
  radius: number;
}

export interface CausalEdge extends d3.SimulationLinkDatum<CausalNode> {
  source: string | CausalNode;
  target: string | CausalNode;
  type: 'CAUSES' | 'SUPPRESSES';
}

interface AlarmRelationshipGraphProps {
  nodes: CausalNode[];
  edges: CausalEdge[];
  width?: number;
  height?: number;
}

// ============================================================
// D3 Force-Directed Graph for Root Cause & Cascading Trips
// ============================================================

export const AlarmRelationshipGraph: React.FC<AlarmRelationshipGraphProps> = ({ nodes, edges, width = 800, height = 600 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // SVG Setup with Zoom
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // Color definitions
    const getColor = (node: CausalNode) => {
      if (node.type === 'SUPPRESSED_ALARM') return 'var(--text-muted)';
      switch (node.priority) {
        case 'CRITICAL': return 'var(--alarm-critical)';
        case 'HIGH': return 'var(--alarm-high)';
        case 'MEDIUM': return 'var(--alarm-medium)';
        default: return 'var(--accent-blue)';
      }
    };

    // Force Simulation
    const simulation = d3.forceSimulation<CausalNode>(nodes)
      .force('link', d3.forceLink<CausalNode, CausalEdge>(edges).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => (d as CausalNode).radius + 10));

    // Arrow markers for directed edges
    svg.append('defs').selectAll('marker')
      .data(['CAUSES', 'SUPPRESSES'])
      .enter().append('marker')
      .attr('id', d => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25) // Offset to not overlap node radius
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', d => d === 'CAUSES' ? 'var(--alarm-high)' : 'var(--text-muted)')
      .attr('d', 'M0,-5L10,0L0,5');

    // Draw Edges
    const link = g.append('g')
      .selectAll('line')
      .data(edges)
      .enter().append('line')
      .attr('stroke', d => d.type === 'CAUSES' ? 'var(--alarm-high)' : 'var(--text-muted)')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => d.type === 'CAUSES' ? 2 : 1)
      .attr('stroke-dasharray', d => d.type === 'SUPPRESSES' ? '5,5' : 'none')
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // Draw Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag<SVGGElement, CausalNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Node Circles
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => getColor(d))
      .attr('stroke', d => d.type === 'ROOT_CAUSE' ? '#fff' : 'var(--color-bg-primary)')
      .attr('stroke-width', d => d.type === 'ROOT_CAUSE' ? 3 : 2)
      .attr('filter', d => d.type === 'ROOT_CAUSE' ? 'drop-shadow(0 0 8px rgba(255,23,68,0.6))' : 'none');

    // Node Labels
    node.append('text')
      .attr('dy', 25)
      .attr('text-anchor', 'middle')
      .text(d => d.name)
      .style('fill', 'var(--text-primary)')
      .style('font-size', '11px')
      .style('font-family', 'var(--font-mono)')
      .style('pointer-events', 'none');

    // Simulation Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as CausalNode).x!)
        .attr('y1', d => (d.source as CausalNode).y!)
        .attr('x2', d => (d.target as CausalNode).x!)
        .attr('y2', d => (d.target as CausalNode).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag Functions
    function dragstarted(event: any, d: CausalNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: CausalNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: CausalNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => { simulation.stop(); };
  }, [nodes, edges, width, height]);

  return (
    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600 }}>Root Cause Analysis Graph</h3>
        <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '11px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--alarm-critical)' }} /> Root Cause</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-blue)' }} /> Correlated Trip</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} /> Suppressed</span>
        </div>
      </div>
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block', cursor: 'grab' }} />
    </div>
  );
};
