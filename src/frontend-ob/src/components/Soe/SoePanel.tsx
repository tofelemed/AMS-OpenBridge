'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useAlarmStore, type SoeEvent } from '../../store/alarmStore';
import { formatTimestampMs } from '../../utils/time';

const SoePanel: React.FC = () => {
  const events = useAlarmStore(s => s.recentSoeEvents);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current || events.length === 0) return;

    const width = wrapperRef.current.clientWidth;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 30, left: 200 };

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const extent = d3.extent(events, d => d.sourceTimestampEpochMs) as [number, number];
    if (!extent[0] || !extent[1]) return;
    
    const timeDomain = [extent[0] - 1000, extent[1] + 1000];

    const x = d3.scaleTime()
      .domain(timeDomain)
      .range([margin.left, width - margin.right]);

    const sources = Array.from(new Set(events.map(e => e.sourceName)));
    const y = d3.scaleBand()
      .domain(sources)
      .range([margin.top, height - margin.bottom])
      .padding(1);

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
      .style('font-family', "'Noto Sans Mono', monospace")
      .style('font-size', '11px');

    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickSize(-height + margin.top + margin.bottom).tickFormat(() => ''))
      .selectAll('line').attr('stroke', 'var(--divider-color)').attr('stroke-dasharray', '2,2');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 100])
      .translateExtent([[margin.left, 0], [width - margin.right, height]])
      .extent([[margin.left, 0], [width - margin.right, height]])
      .on('zoom', (event) => {
        const newX = event.transform.rescaleX(x);
        xAxisGroup.call(xAxis.scale(newX));
        svg.selectAll<SVGCircleElement, SoeEvent>('circle')
          .attr('cx', d => newX(d.sourceTimestampEpochMs));
      });

    svg.call(zoom);

    const tooltip = d3.select(wrapperRef.current)
      .append('div')
      .attr('class', 'soe-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', 'var(--surface-background-color)')
      .style('border', '1px solid var(--divider-color)')
      .style('padding', '12px')
      .style('border-radius', '4px')
      .style('pointer-events', 'none')
      .style('color', 'var(--on-surface-active-color)')
      .style('box-shadow', '0 8px 24px rgba(0,0,0,0.4)')
      .style('z-index', '100');

    svg.selectAll('circle')
      .data(events)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.sourceTimestampEpochMs))
      .attr('cy', d => y(d.sourceName)!)
      .attr('r', 6)
      .attr('fill', d => {
        if (d.priority === 'CRITICAL') return 'var(--alert-alarm-border-color)';
        if (d.priority === 'HIGH') return 'var(--alert-warning-border-color)';
        return 'var(--focus-color)';
      })
      .attr('stroke', 'var(--surface-background-color)')
      .attr('stroke-width', 2)
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget).attr('r', 9);
        tooltip.transition().duration(200).style('opacity', .9);
        tooltip.html(`
          <div style="font-family: 'Noto Sans Mono', monospace; color: var(--focus-color); font-size: 11px; margin-bottom: 4px;">
            ${formatTimestampMs(d.sourceTimestampEpochMs)}
          </div>
          <strong>${d.sourceName}</strong><br/>
          ${d.message}<br/>
          <span style="color: ${d.isOutOfOrder ? 'var(--alert-caution-border-color)' : 'var(--on-container-neutral-color)'}">
            Seq: ${d.id} ${d.isOutOfOrder ? '(Out of order)' : ''}
          </span>
        `)
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget).attr('r', 6);
        tooltip.transition().duration(500).style('opacity', 0);
      });

    return () => { tooltip.remove(); };
  }, [events]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--spacing-4, 16px)' }}>
      
      <div className="ob-card" style={{ padding: 'var(--spacing-4, 16px)' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 'var(--spacing-2, 8px)' }}>Sequence of Events (SOE)</h2>
        <p style={{ fontSize: '13px', color: 'var(--on-container-neutral-color)' }}>
          High-precision microsecond timeline for root-cause analysis. Scroll to zoom into millisecond intervals. Pan to navigate time.
        </p>
      </div>

      <div ref={wrapperRef} className="ob-card" style={{ padding: 'var(--spacing-4, 16px)', position: 'relative' }}>
        {events.length === 0 ? (
          <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-container-neutral-color)' }}>
            Waiting for live SOE events...
          </div>
        ) : (
          <svg ref={svgRef}></svg>
        )}
      </div>

      <div className="ob-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ 
          padding: 'var(--spacing-3, 12px) var(--spacing-4, 16px)', 
          borderBottom: '1px solid var(--divider-color)', 
          fontWeight: 600, 
          fontSize: '13px' 
        }}>
          Event Log
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-4, 16px)' }}>
          {events.map((e, i) => (
            <div 
              key={`${e.id}-${i}`} 
              className={`event-item ${
                e.priority === 'CRITICAL' ? 'event-item--alarm' : 
                e.priority === 'HIGH' ? 'event-item--warning' : ''
              }`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>{e.sourceName}</span>
                <span className="timestamp">{formatTimestampMs(e.sourceTimestampEpochMs)}</span>
              </div>
              <div style={{ color: 'var(--on-container-neutral-color)' }}>{e.message}</div>
              {e.isOutOfOrder && (
                <div style={{ fontSize: '11px', color: 'var(--alert-caution-border-color)', marginTop: '4px' }}>
                  ⚠ Corrected late arrival
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default SoePanel;
