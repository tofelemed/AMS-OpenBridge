'use client';

/**
 * Explorer › History. Diagnosis episodes for this loop.
 *
 * Two defects drove the rewrite:
 *
 * 1. Consecutive identical frames were listed one per row. A loop re-detecting
 *    the same fault every 15 minutes produced ten rows of "DETECTED FINAL
 *    ELEMENT NONLINEARITY · 1 window · peak 54%" — one fact, five pages of
 *    pager. Consecutive same-diagnosis frames now collapse into a run that can
 *    be expanded.
 * 2. Frames whose closed_at precedes their opened_at were rendered as a literal
 *    backwards range ("8/7 9:45 AM → 7/27 7:45 AM"), i.e. the UI printed an
 *    impossible span as fact. That is an upstream defect in the event frames,
 *    but this screen must flag it rather than repeat it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventFrame, CpmLoop } from '../../../api/cpmApi';
import { useCpmEvents } from '../../../hooks/useCpm';
import { EmptyState, QueryError, TonePill, fmtDateTime } from '../shared';
import { usePagedSlice } from '../../shared/ListPager';

/**
 * sort:'recent' is load-bearing, not a preference: the endpoint's default order
 * is triage (open first, then peak confidence), so under the default this LIMIT
 * kept the highest-CONFIDENCE frames while the tab rendered them as a timeline.
 */
export const HISTORY_QUERY = {
  openOnly: false, includeShelved: true, limit: 50, sort: 'recent' as const,
};
const PAGE_SIZE = 10;

interface Span { startMs: number; endMs: number | null; invalid: boolean }

function spanOf(e: CpmEventFrame): Span {
  const startMs = Date.parse(e.opened_at);
  const raw = e.closed_at ? Date.parse(e.closed_at) : null;
  const closed = raw != null && !Number.isNaN(raw) ? raw : null;
  const invalid = closed != null && !Number.isNaN(startMs) && closed < startMs;
  return { startMs, endMs: invalid ? null : closed, invalid };
}

interface Run {
  key: string;
  diagnosis: string;
  frames: CpmEventFrame[];
  startMs: number;
  endMs: number | null;
  peak: number;
  windows: number;
  anyOpen: boolean;
  anyInvalid: boolean;
  ackState: string;
}

/** Collapse CONSECUTIVE frames carrying the same diagnosis into one run. */
function toRuns(rows: CpmEventFrame[]): Run[] {
  const runs: Run[] = [];
  for (const e of rows) {
    const span = spanOf(e);
    const head = runs[runs.length - 1];
    if (head && head.diagnosis === e.peak_diagnosis) {
      head.frames.push(e);
      head.startMs = Math.min(head.startMs, span.startMs);
      head.endMs = span.endMs == null || head.endMs == null
        ? null : Math.max(head.endMs, span.endMs);
      head.peak = Math.max(head.peak, e.peak_confidence);
      head.windows += e.window_count;
      head.anyOpen = head.anyOpen || !e.closed_at;
      head.anyInvalid = head.anyInvalid || span.invalid;
      continue;
    }
    runs.push({
      key: String(e.id),
      diagnosis: e.peak_diagnosis,
      frames: [e],
      startMs: span.startMs,
      endMs: span.endMs,
      peak: e.peak_confidence,
      windows: e.window_count,
      anyOpen: !e.closed_at,
      anyInvalid: span.invalid,
      ackState: e.ack_state,
    });
  }
  return runs;
}

const spanText = (run: Run) =>
  run.anyOpen || run.endMs == null
    ? `${fmtDateTime(run.startMs)} · open`
    : `${fmtDateTime(run.startMs)} → ${fmtDateTime(run.endMs)}`;

export const HistoryTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const events = useCpmEvents({ loopId: loop.loopId, ...HISTORY_QUERY });
  const rows = useMemo(() => events.data?.events ?? [], [events.data]);
  const runs = useMemo(() => toRuns(rows), [rows]);

  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Switching loops must not leave the operator on page 4 of the previous loop.
  useEffect(() => { setPage(0); setExpanded(new Set()); }, [loop.loopId]);

  // Episodes were a dead end here, while every sibling screen routes its
  // evidence somewhere. Historical bounds its trend, KPI overlay and gate
  // history to ?from/?to, so a run's own span is the right window to hand it.
  const openSpan = (startMs: number, endMs: number | null) => {
    const q = new URLSearchParams({
      loop: loop.loopId,
      from: new Date(startMs).toISOString(),
      to: new Date(endMs ?? Date.now()).toISOString(),
    });
    navigate(`/cpm/historical?${q.toString()}`);
  };

  const { pageCount, safePage, pageItems } = usePagedSlice(runs, page, PAGE_SIZE);

  return (
    <div>
      {events.isLoading && <EmptyState title="Loading history…" />}
      {events.isError && (
        <QueryError title="Episode history unavailable"
          error={events.error} retry={() => void events.refetch()} />
      )}
      {!events.isLoading && !events.isError && runs.length === 0 && (
        <EmptyState title="No diagnosis episodes recorded for this loop" />
      )}

      {pageItems.map(run => {
        const isOpen = expanded.has(run.key);
        return (
          <div key={run.key} className="cpm-episode">
            <button
              type="button"
              className="cpm-episode__main"
              onClick={() => openSpan(run.startMs, run.endMs)}
            >
              <span className="cpm-event-row__sub">{spanText(run)}</span>
              <span className="cpm-episode__body">
                <span className="cpm-event-row__title">{run.diagnosis.replace(/_/g, ' ')}</span>
                <span className="cpm-event-row__sub">
                  {run.frames.length > 1 ? `${run.frames.length} episodes · ` : ''}
                  {run.windows} window(s) · peak {(run.peak * 100).toFixed(0)}%
                </span>
              </span>
              <span className="cpm-episode__state">
                {/* An impossible span is a data defect, not a duration. Say so
                    rather than printing a negative range as if it were real. */}
                {run.anyInvalid && <TonePill tone="warn">END BEFORE START</TonePill>}
                <TonePill tone={run.anyOpen ? 'warn' : 'muted'}>{run.ackState}</TonePill>
              </span>
            </button>

            {run.frames.length > 1 && (
              <button
                type="button"
                className="cpm-episode__toggle"
                aria-expanded={isOpen}
                onClick={() => setExpanded(s => {
                  const next = new Set(s);
                  if (next.has(run.key)) next.delete(run.key); else next.add(run.key);
                  return next;
                })}
              >
                {isOpen ? '▾' : '▸'} {run.frames.length} episodes
              </button>
            )}

            {isOpen && run.frames.map(e => {
              const span = spanOf(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  className="cpm-episode__frame"
                  onClick={() => openSpan(span.startMs, span.endMs)}
                >
                  <span className="cpm-event-row__sub">
                    {fmtDateTime(e.opened_at)}
                    {span.invalid ? ' · end before start'
                      : span.endMs != null ? ` → ${fmtDateTime(span.endMs)}` : ' · open'}
                  </span>
                  <span className="cpm-event-row__sub">
                    {e.window_count} window(s) · peak {(e.peak_confidence * 100).toFixed(0)}%
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}

      {pageCount > 1 && (
        <div className="cpm-pager">
          <ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}>← Prev</ObcButton>
          <span className="cpm-event-row__sub">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, runs.length)} of{' '}
            {runs.length} run(s) from {rows.length} episode(s)
            {rows.length >= HISTORY_QUERY.limit
              ? ` (newest ${HISTORY_QUERY.limit}; older not fetched)` : ''}
            {' '}· Page {safePage + 1} of {pageCount}
          </span>
          <ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}>Next →</ObcButton>
        </div>
      )}
    </div>
  );
};

export default HistoryTab;
