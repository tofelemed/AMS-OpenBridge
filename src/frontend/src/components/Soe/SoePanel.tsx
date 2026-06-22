import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { useAlarmStore, type SoeEvent } from '../../store/alarmStore';
import { formatTimestampMs } from '../../utils/time';

// ============================================================
// Sequence of Events (SOE) D3 Timeline Viewer
// Extremely important for root-cause analysis. Supports zoomable ms scale.
// ============================================================

const SoePanel: React.FC = () => {
  const events = useAlarmStore(s => s.recentSoeEvents);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Render D3 Timeline
  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current || events.length === 0) return;

    const width = wrapperRef.current.clientWidth;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 30, left: 200 };

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // X Scale: Time
    const extent = d3.extent(events, d => d.sourceTimestampEpochMs) as [number, number];
    if (!extent[0] || !extent[1]) return;
    
    // Add padding to domain
    const timeDomain = [extent[0] - 1000, extent[1] + 1000];

    const x = d3.scaleTime()
      .domain(timeDomain)
      .range([margin.left, width - margin.right]);

    // Y Scale: Sources
    const sources = Array.from(new Set(events.map(e => e.sourceName)));
    const y = d3.scaleBand()
      .domain(sources)
      .range([margin.top, height - margin.bottom])
      .padding(1);

    // Axes
    const xAxis = d3.axisBottom(x)
      .ticks(10)
      .tickFormat(d => d3.timeFormat('%H:%M:%S.%L')(d as Date));
    
    const xAxisGroup = svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(xAxis)
      .attr('class', 'x-axis');

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('fill', 'var(--text-primary)')
      .style('font-family', 'var(--font-mono)')
      .style('font-size', '11px');

    // Grid lines
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickSize(-height + margin.top + margin.bottom).tickFormat(() => ''))
      .selectAll('line').attr('stroke', 'var(--color-border)').attr('stroke-dasharray', '2,2');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 100]) // Allow deep zoom for ms differences
      .translateExtent([[margin.left, 0], [width - margin.right, height]])
      .extent([[margin.left, 0], [width - margin.right, height]])
      .on('zoom', (event) => {
        const newX = event.transform.rescaleX(x);
        xAxisGroup.call(xAxis.scale(newX));
        svg.selectAll<SVGCircleElement, SoeEvent>('circle')
          .attr('cx', d => newX(d.sourceTimestampEpochMs));
      });

    svg.call(zoom);

    // Tooltip
    const tooltip = d3.select(wrapperRef.current)
      .append('div')
      .attr('class', 'soe-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', 'var(--color-bg-elevated)')
      .style('border', '1px solid var(--color-border)')
      .style('padding', 'var(--space-3)')
      .style('border-radius', 'var(--radius-md)')
      .style('pointer-events', 'none')
      .style('color', 'var(--text-primary)')
      .style('box-shadow', 'var(--shadow-lg)')
      .style('z-index', 100);

    // Events
    svg.selectAll('circle')
      .data(events)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.sourceTimestampEpochMs))
      .attr('cy', d => y(d.sourceName)!)
      .attr('r', 6)
      .attr('fill', d => {
        if (d.priority === 'CRITICAL') return 'var(--alarm-critical)';
        if (d.priority === 'HIGH') return 'var(--alarm-high)';
        return 'var(--accent-blue)';
      })
      .attr('stroke', 'var(--color-bg-primary)')
      .attr('stroke-width', 2)
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget).attr('r', 9).attr('stroke', 'var(--text-primary)');
        tooltip.transition().duration(200).style('opacity', .9);
        tooltip.html(`
          <div style="font-family: var(--font-mono); color: var(--accent-cyan); font-size: 11px; margin-bottom: 4px;">
            ${formatTimestampMs(d.sourceTimestampEpochMs)}
          </div>
          <strong>${d.sourceName}</strong><br/>
          ${d.message}<br/>
          <span style="color: ${d.isOutOfOrder ? 'var(--color-warning)' : 'var(--text-muted)'}">
            Seq: ${d.id} ${d.isOutOfOrder ? '(Out of order)' : ''}
          </span>
        `)
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget).attr('r', 6).attr('stroke', 'var(--color-bg-primary)');
        tooltip.transition().duration(500).style('opacity', 0);
      });

    return () => { tooltip.remove(); };
  }, [events]);

  return (
    <div style={{ padding: 'var(--space-4)', height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      
      <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Sequence of Events (SOE)</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          High-precision microsecond timeline for root-cause analysis. Scroll to zoom into millisecond intervals. Pan to navigate time.
        </p>
      </div>

      <div ref={wrapperRef} style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: 'var(--space-4)', position: 'relative' }}>
        {events.length === 0 ? (
          <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Waiting for live SOE events...
          </div>
        ) : (
          <svg ref={svgRef}></svg>
        )}
      </div>

      <div style={{ flex: 1, background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: '13px' }}>
          Event Log
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
          <div className="soe-timeline">
            {events.map((e, i) => (
              <div key={`${e.id}-${i}`} className={`soe-event ${e.priority === 'CRITICAL' ? 'soe-event--critical' : e.priority === 'HIGH' ? 'soe-event--high' : ''} ${e.isOutOfOrder ? 'soe-event--out-of-order' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                  <span className="soe-event__source">{e.sourceName}</span>
                  <span className="soe-event__timestamp">{formatTimestampMs(e.sourceTimestampEpochMs)}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{e.message}</div>
                {e.isOutOfOrder && <div style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: 4 }}>⚠ Corrected late arrival</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default SoePanel;
