'use client';

/**
 * Explorer › History. Diagnosis episodes for this loop, consecutive same-diagnosis episodes collapsed into one run
 * (historyQuery.ts holds the grouping and the impossible-span check).
 *
 * CHG-185 (owner review item 6): one compact table — Period · Finding · Episodes · Peak score · Review state — and one
 * "Open in Loop Events ↗" link per run (its newest episode). A run's episodes open inline as lines that show only what differs:
 * their period and score, and their windows where those differ. The review state is Loop Events' pill, in its words. A row or a
 * period still opens Historical over that span. Dates and times keep their format (owner Q5).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmEvents } from '../../../hooks/useCpm';
import { Toggletip } from '../../../ui/Toggletip';
// the shared table look (DataTable's sheet); the episode lines under a run are not a DataTable shape
import '../../../ui/data-table.css';
import { EmptyState, QueryError, TonePill } from '../shared';
import { usePagedSlice } from '../../shared/ListPager';
import { reviewView } from '../events/shelfState';
import { diagnosisLabel } from '../vocabulary';
import { EVIDENCE_SCORE_HELP, evidenceScore } from '../evidenceScore';
import { eventsHref, historicalHref } from '../cpaHref';
import {
  HISTORY_QUERY, episodePeriod, episodeWindowsDiffer, runPeriod, spanOf, toRuns, windowsText, type Run,
} from './historyQuery';

const PAGE_SIZE = 10;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The links and toggles in a row act on their own; the row's click (Historical) must not follow. */
const own = (e: React.MouseEvent) => e.stopPropagation();

type OpenSpan = (startMs: number, endMs: number | null) => void;

const Period: React.FC<{ text: string; onOpen: () => void }> = ({ text, onOpen }) => (
  <button type="button" className="cpm-history__period" title="Show in Historical" aria-label={`${text}, show in Historical`}
    onClick={e => { own(e); onOpen(); }}>
    {text}
  </button>
);

/** A run's episodes: only what differs from the run — the period, the windows where they differ, the score. */
const EpisodeRows: React.FC<{ run: Run; openSpan: OpenSpan }> = ({ run, openSpan }) => {
  const showWindows = episodeWindowsDiffer(run);
  return (
    <>
      {run.frames.map(e => {
        const span = spanOf(e);
        const open = () => openSpan(span.startMs, span.endMs);
        return (
          <tr key={e.id} className="cpm-history__episode cpm-row-click" onClick={open}>
            <td data-label="Period"><Period text={episodePeriod(e)} onOpen={open} /></td>
            <td className="cpm-history__blank" />
            <td data-label="Episodes" className="cpm-history__sub">{showWindows ? windowsText(e.window_count, [e.window_kind]) : null}</td>
            <td data-label="Peak score" className="ui-table__cell--end">{evidenceScore(e.peak_confidence) ?? '—'}</td>
            <td className="cpm-history__blank" />
            <td className="cpm-history__blank" />
          </tr>
        );
      })}
    </>
  );
};

const RunRow: React.FC<{ run: Run; now: number; isOpen: boolean; onToggle: () => void; openSpan: OpenSpan; onEvents: (id: number) => void }> = ({
  run, now, isOpen, onToggle, openSpan, onEvents,
}) => {
  const newest = run.frames[0];
  const review = reviewView(newest, now);
  const many = run.frames.length > 1;
  const open = () => openSpan(run.startMs, run.endMs);
  return (
    <tr className="cpm-history__run cpm-row-click" onClick={open}>
      <td data-label="Period">
        <span className="cpm-history__cell">
          <Period text={runPeriod(run)} onOpen={open} />
          {/* An impossible span is a data defect, not a duration: say so rather than print a negative range. */}
          {run.anyInvalid && <TonePill tone="warn">End before start</TonePill>}
        </span>
      </td>
      <td data-label="Finding" className="cpm-history__finding">{diagnosisLabel(run.diagnosis)}</td>
      <td data-label="Episodes">
        <span className="cpm-history__cell cpm-history__cell--stack">
          {many ? (
            <button type="button" className="cpm-history__toggle" aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Hide' : 'Show'} the ${run.frames.length} episodes`}
              onClick={e => { own(e); onToggle(); }}>
              <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {run.frames.length}
            </button>
          ) : <span>1</span>}
          <span className="cpm-history__sub">{windowsText(run.windows, run.kinds)}</span>
        </span>
      </td>
      <td data-label="Peak score" className="ui-table__cell--end">{evidenceScore(run.peak) ?? '—'}</td>
      <td data-label="Review state"><TonePill tone={review.tone} glyph={review.glyph}>{review.label}</TonePill></td>
      <td className="cpm-history__action" onClick={own}>
        {/* The run's newest episode; one link per run (owner review item 6). */}
        <ObcButton className="ui-link" variant="flat" onClick={() => onEvents(newest.id)}>Open in Loop Events ↗</ObcButton>
      </td>
    </tr>
  );
};

export const HistoryTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const events = useCpmEvents({ loopId: loop.loopId, ...HISTORY_QUERY });
  const rows = useMemo(() => events.data?.events ?? [], [events.data]);
  const runs = useMemo(() => toRuns(rows), [rows]);

  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Switching loops must not leave the operator on page 4 of the previous loop.
  useEffect(() => { setPage(0); setExpanded(new Set()); }, [loop.loopId]);

  // Historical bounds its trend, KPI overlay and gate history to ?from/?to, so a run's own span is the right window to hand it.
  const openSpan: OpenSpan = (startMs, endMs) => {
    navigate(historicalHref(loop.loopId, {
      from: new Date(startMs).toISOString(),
      to: new Date(endMs ?? Date.now()).toISOString(),
    }));
  };
  const toggle = (key: string) => setExpanded(s => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const { pageCount, safePage, pageItems } = usePagedSlice(runs, page, PAGE_SIZE);
  const now = Date.now();

  return (
    <div>
      {events.isLoading && <EmptyState title="Loading history…" />}
      {events.isError && (
        <QueryError title="Episode history unavailable"
          error={events.error} retry={() => void events.refetch()} />
      )}
      {!events.isLoading && !events.isError && runs.length === 0 && (
        <EmptyState title="No diagnosis episodes recorded for this loop"
          copy="An episode opens when a finding persists across windows; none has on this loop in the retained period."
          next={[{ label: 'Verdicts over time in Historical', to: historicalHref(loop.loopId) }]} />
      )}

      {pageItems.length > 0 && (
        <div className="ui-table ui-table--compact cpm-history">
          <table>
            <caption className="cpm-visually-hidden">Diagnosis episodes of {loop.loopId}</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Finding</th>
                <th scope="col">Episodes</th>
                <th scope="col" className="ui-table__cell--end">
                  <span className="cpm-history__head">
                    Peak score
                    <Toggletip variant="how-to" label="About the peak score">
                      <p>The highest evidence score in the period.</p>
                      <p>{EVIDENCE_SCORE_HELP}</p>
                    </Toggletip>
                  </span>
                </th>
                <th scope="col">Review state</th>
                <th scope="col"><span className="cpm-visually-hidden">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(run => (
                <React.Fragment key={run.key}>
                  <RunRow run={run} now={now} isOpen={expanded.has(run.key)} onToggle={() => toggle(run.key)} openSpan={openSpan}
                    onEvents={id => navigate(eventsHref({ loop: loop.loopId, event: id }))} />
                  {run.frames.length > 1 && expanded.has(run.key) && <EpisodeRows run={run} openSpan={openSpan} />}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cpm-explorer-foot">
        <span className="cpm-explorer-foot__links">
          <ObcButton variant="flat" onClick={() => navigate(historicalHref(loop.loopId))}>Open Historical →</ObcButton>
        </span>
      </div>

      {pageCount > 1 && (
        <div className="cpm-pager">
          <span title={safePage === 0 ? 'Already on the first page' : undefined}><ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}>← Prev</ObcButton></span>
          <span className="cpm-event-row__sub">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, runs.length)} of{' '}
            {plural(runs.length, 'run', 'runs')} from {plural(rows.length, 'episode', 'episodes')}
            {rows.length >= HISTORY_QUERY.limit
              ? ` (newest ${HISTORY_QUERY.limit}; older not fetched)` : ''}
            {' '}· Page {safePage + 1} of {pageCount}
          </span>
          <span title={safePage >= pageCount - 1 ? 'Already on the last page' : undefined}><ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}>Next →</ObcButton></span>
        </div>
      )}
    </div>
  );
};

export default HistoryTab;
