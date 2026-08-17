'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useAlarmStore, type SoeEvent } from '../../store/alarmStore';
import { formatTimestampMs } from '../../utils/time';
import { T } from '../../styles/theme';
import { ListPager, usePagedSlice } from '../shared/ListPager';

// K: plant/OPC event text (sourceName, message) is external data — interpolating
// it raw into tooltip.html() is stored-XSS. Escape the interpolated fields.
function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}


const PRIORITY_COLOR = {
  CRITICAL: T.critical,
  HIGH:     T.caution,
  MEDIUM:   T.blue,
  LOW:      T.blueMuted,
} as Record<string, string>;

// The store keeps the latest MAX_SOE_EVENTS (500); the log rendered all of them.
const PAGE_SIZE = 25;

const SoePanel: React.FC = () => {
  const events    = useAlarmStore(s => s.recentSoeEvents);
  const svgRef    = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Preserve the operator's zoom/pan across rebuilds. A new SOE event re-runs the
  // effect (full d3 rebuild); without this, every arriving event snapped an
  // operator who was zoomed into a microsecond window back to full extent.
  const transformRef = useRef<d3.ZoomTransform | null>(null);

  // Event-log paging. The d3 timeline above still plots the full buffer — only the
  // log is paged. Page 1 tracks the live head; deeper pages drift as new events
  // push in, which is inherent to a rolling buffer.
  const [page, setPage] = useState(0);
  const { pageCount, safePage, pageItems: pagedEvents } = usePagedSlice(events, page, PAGE_SIZE);

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current || events.length === 0) return;

    const width  = wrapperRef.current.clientWidth;
    const height = 380;
    const margin = { top: 24, right: 24, bottom: 36, left: 210 };

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width).attr('height', height)
      .style('background', 'transparent');

    const extent = d3.extent(events, d => d.sourceTimestampEpochMs) as [number, number];
    if (!extent[0] || !extent[1]) return;

    const timeDomain = [extent[0] - 1000, extent[1] + 1000];
    const x = d3.scaleTime().domain(timeDomain).range([margin.left, width - margin.right]);
    const sources = Array.from(new Set(events.map(e => e.sourceName)));
    const y = d3.scaleBand().domain(sources).range([margin.top, height - margin.bottom]).padding(0.4);

    /* Light grid lines */
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(
        d3.axisBottom(x)
          .tickSize(-(height - margin.top - margin.bottom))
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', T.borderLight)
      .attr('stroke-width', 1);

    svg.select('.grid .domain').remove();

    /* Horizontal lane separators */
    sources.forEach(src => {
      svg.append('line')
        .attr('x1', margin.left).attr('x2', width - margin.right)
        .attr('y1', y(src)!).attr('y2', y(src)!)
        .attr('stroke', T.borderLight)
        .attr('stroke-width', 1);
    });

    /* X-axis */
    const xAxisGroup = svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(
        d3.axisBottom(x)
          .ticks(8)
          .tickFormat(d => d3.timeFormat('%H:%M:%S')(d as Date))
      );

    xAxisGroup.selectAll('text')
      .attr('fill', T.textSecondary)
      .attr('font-size', '11px');
    xAxisGroup.select('.domain').attr('stroke', T.border);
    xAxisGroup.selectAll('.tick line').attr('stroke', T.border);

    /* Y-axis (source names) */
    const yAxisGroup = svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    yAxisGroup.selectAll('text')
      .attr('fill', T.textSecondary)
      .attr('font-family', "'Noto Sans Mono', monospace")
      .attr('font-size', '11px');
    yAxisGroup.select('.domain').remove();
    yAxisGroup.selectAll('.tick line').remove();

    /* Zoom behaviour */
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 200])
      .translateExtent([[margin.left, 0], [width - margin.right, height]])
      .extent([[margin.left, 0], [width - margin.right, height]])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        const newX = event.transform.rescaleX(x);
        xAxisGroup.call(
          d3.axisBottom(newX)
            .ticks(8)
            .tickFormat(d => d3.timeFormat('%H:%M:%S.%L')(d as Date))
        );
        xAxisGroup.selectAll('text').attr('fill', T.textSecondary).attr('font-size', '11px');
        svg.selectAll<SVGCircleElement, SoeEvent>('circle')
          .attr('cx', d => newX(d.sourceTimestampEpochMs));
      });

    svg.call(zoom);

    /* Tooltip */
    const tooltip = d3.select(wrapperRef.current)
      .append('div')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', T.card)
      .style('border', `1px solid ${T.border}`)
      .style('border-left', `3px solid ${T.blue}`)
      .style('padding', '12px 14px')
      .style('border-radius', T.radiusSm)
      .style('pointer-events', 'none')
      .style('color', T.textPrimary)
      .style('box-shadow', T.shadow)
      .style('z-index', '100')
      .style('min-width', '220px')
      .style('font-size', '12px');

    /* Event dots */
    svg.selectAll('circle')
      .data(events)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.sourceTimestampEpochMs))
      .attr('cy', d => y(d.sourceName)!)
      .attr('r', 6)
      .attr('fill', d => PRIORITY_COLOR[d.priority] ?? T.blue)
      .attr('stroke', T.card)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget).attr('r', 9).attr('stroke-width', 2.5);
        tooltip.transition().duration(150).style('opacity', 1);
        tooltip.html(`
          <div style="font-family:'Noto Sans Mono',monospace;color:${T.blue};font-size:11px;margin-bottom:6px">
            ${formatTimestampMs(d.sourceTimestampEpochMs)}
          </div>
          <div style="font-weight:700;color:${T.textPrimary};margin-bottom:4px">${escapeHtml(d.sourceName)}</div>
          <div style="color:${T.textSecondary};margin-bottom:6px">${escapeHtml(d.message)}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="padding:2px 8px;border-radius:12px;font-size:10.5px;font-weight:700;
              background:${PRIORITY_COLOR[d.priority] ?? T.blue}22;
              color:${PRIORITY_COLOR[d.priority] ?? T.blue}">${escapeHtml(d.priority)}</span>
            ${d.isOutOfOrder ? `<span style="color:${T.caution};font-size:11px">⚠ Late arrival</span>` : ''}
          </div>
        `)
          .style('left', `${(event as MouseEvent).pageX + 14}px`)
          .style('top',  `${(event as MouseEvent).pageY - 32}px`);
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget).attr('r', 6).attr('stroke-width', 2);
        tooltip.transition().duration(300).style('opacity', 0);
      });

    // Re-apply the pre-rebuild zoom/pan (if the operator had zoomed in) so a new
    // event doesn't reset their view. Fires the zoom handler → repositions axis
    // + circles against the restored transform.
    const saved = transformRef.current;
    if (saved && saved.k !== 1) {
      svg.call(zoom.transform, saved);
    }

    return () => { tooltip.remove(); };
  }, [events]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0' }}>

      {/* ── Page header ─────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Sequence of Events
          </h1>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: '5px 0 0' }}>
            High-precision microsecond timeline for root-cause analysis. Scroll to zoom · drag to pan.
          </p>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: T.radiusSm, padding: '8px 14px',
          boxShadow: T.shadow, flexShrink: 0, flexWrap: 'wrap',
        }}>
          {Object.entries(PRIORITY_COLOR).map(([p, c]) => (
            <span key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, color: T.textSecondary }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* ── Timeline card ──────────────────────── */}
      <div
        ref={wrapperRef}
        style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: T.radius, padding: '18px 20px',
          position: 'relative', boxShadow: T.shadow,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: `1.5px solid ${T.border}` }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            SOE Timeline
          </span>
          <span style={{ fontSize: '12px', color: T.textMuted }}>
            {events.length} event{events.length !== 1 ? 's' : ''} · {events.length > 0 ? 'Live' : 'No data'}
          </span>
        </div>

        {events.length === 0 ? (
          <div style={{
            height: 380, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px',
          }}>
            <div style={{ fontSize: '36px' }}>📡</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: T.textSecondary }}>Waiting for live SOE events</div>
            <div style={{ fontSize: '13px', color: T.textMuted }}>Events will appear here when the OPC AE server emits alarms</div>
          </div>
        ) : (
          <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
        )}
      </div>

      {/* ── Event log ──────────────────────────── */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: T.radius, overflow: 'hidden',
        boxShadow: T.shadow, flex: 1,
      }}>
        {/* Log header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1.5px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: T.bg,
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Event Log
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '20px',
            background: events.length > 0 ? T.blueLight : T.bg,
            border: `1px solid ${events.length > 0 ? T.blueMuted : T.border}`,
            fontSize: '12px', fontWeight: 600, color: events.length > 0 ? T.blue : T.textMuted,
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: events.length > 0 ? T.blue : T.textMuted, display: 'inline-block' }} />
            {events.length} events
          </span>
        </div>

        {/* Event rows */}
        <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
          {events.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: T.textMuted, fontSize: '13px' }}>
              No SOE events received yet.
            </div>
          ) : (
            pagedEvents.map((e) => {
              const color = PRIORITY_COLOR[e.priority] ?? T.blue;
              return (
                <div
                  key={`${e.id}-${e.sourceTimestampEpochMs}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '14px',
                    padding: '13px 20px',
                    borderBottom: `1px solid ${T.borderLight}`,
                    background: T.card,
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = T.blueLight)}
                  onMouseLeave={ev => (ev.currentTarget.style.background = T.card)}
                >
                  {/* Priority dot */}
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: color, flexShrink: 0, marginTop: '4px',
                    boxShadow: e.priority === 'CRITICAL' ? `0 0 6px ${T.critical}88` : 'none',
                  }} />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 700, color: T.textPrimary, fontSize: '13px', fontFamily: "'Noto Sans Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.sourceName}
                      </span>
                      <span style={{ fontSize: '11.5px', color: T.textMuted, flexShrink: 0, fontFamily: "'Noto Sans Mono', monospace" }}>
                        {formatTimestampMs(e.sourceTimestampEpochMs)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12.5px', color: T.textSecondary, marginBottom: e.isOutOfOrder ? '4px' : 0 }}>
                      {e.message}
                    </div>
                    {e.isOutOfOrder && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        fontSize: '11px', fontWeight: 600, color: T.caution,
                        background: T.warningBg, border: `1px solid ${T.warningBorder}`,
                        padding: '2px 8px', borderRadius: '20px', marginTop: '4px',
                      }}>
                        ⚠ Corrected late arrival
                      </div>
                    )}
                  </div>

                  {/* Priority badge */}
                  <span style={{
                    padding: '3px 9px', borderRadius: '20px', flexShrink: 0,
                    fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase',
                    background: `${color}18`, color, border: `1px solid ${color}44`,
                  }}>
                    {e.priority}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <ListPager
          page={safePage} pageCount={pageCount} pageSize={PAGE_SIZE}
          total={events.length} onPageChange={setPage}
          note={safePage === 0 ? 'newest first' : 'older events'}
        />
      </div>
    </div>
  );
};

export default SoePanel;
