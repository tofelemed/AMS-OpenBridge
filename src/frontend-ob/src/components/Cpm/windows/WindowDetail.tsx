'use client';

/**
 * CHG-025 — one emitted window's sub-page: results, metadata, sample density and the
 * across-window-sizes comparison. Opened from the inspector's list (which is hidden
 * while this is shown) with Back and Newer/Older navigation over the loaded windows.
 * These sections used to render BELOW a list that can be hundreds of rows long, so the
 * reader had to scroll to find what they had just clicked.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import type { CpmKpiRow, CpmLoop, CpmWindowSpec } from '../../../api/cpmApi';
import { useRawWindow } from '../../../hooks/useCpm';
import { loopSeries } from '../../../utils/loopSeries';
import {
  CpmIconButton, EmptyState, KvRow, PanelHead, QueryError,
  fmtDateTime, fmtDuration, fmtWindowShape, loopTrendHref,
} from '../shared';
import { WindowResultsPanel } from './WindowResults';
import CompareAcrossKinds from './CompareAcrossKinds';
import { SAMPLE_PERIOD_S, completenessOf, fmtBytesless } from './windowMath';

const BUCKETS = 24;

export interface WindowDetailProps {
  loopId: string;
  /** The registry entry, for the pinned Trend link (its tags name the series). */
  loop: CpmLoop | undefined;
  profile: string;
  spec: CpmWindowSpec | undefined;
  isLong: boolean;
  profileS: number;
  selected: CpmKpiRow;
  /** Position among the loaded windows (0 = newest) and how many are loaded. */
  index: number;
  loaded: number;
  newer: CpmKpiRow | null;
  older: CpmKpiRow | null;
  shortSpecs: CpmWindowSpec[];
  onBack: () => void;
  onSelect: (windowEnd: string) => void;
  onPickKind: (kind: string) => void;
}

export const WindowDetail: React.FC<WindowDetailProps> = ({
  loopId, loop, profile, spec, isLong, profileS, selected, index, loaded, newer, older,
  shortSpecs, onBack, onSelect, onPickKind,
}) => {
  const navigate = useNavigate();

  // Sample density across the selected window from the raw historian slice.
  const series = loopSeries(loopId);
  const winStart = selected.window_start ? new Date(selected.window_start) : undefined;
  const winEnd = selected.window_end ? new Date(selected.window_end) : undefined;
  const raw = useRawWindow(series, winStart, winEnd, 'pv', 5000);

  // W1: the density expectation uses the ENGINE'S per-window sample period when
  // the selected row carries one — the metadata panel one column over already
  // does (P2-11), but this strip kept billing every loop against the hardcoded
  // 5s grid, so a 1s loop read ~500% and a 10s loop read "sparse" at perfect
  // coverage.
  const gridPeriodS = typeof selected.sample_period_sec === 'number' && selected.sample_period_sec > 0
    ? selected.sample_period_sec : SAMPLE_PERIOD_S;
  const gridIsServed = typeof selected.sample_period_sec === 'number' && selected.sample_period_sec > 0;

  const density = useMemo(() => {
    if (!winStart || !winEnd) return [];
    const span = winEnd.getTime() - winStart.getTime();
    if (span <= 0) return [];
    const counts = new Array<number>(BUCKETS).fill(0);
    let lastTs = winStart.getTime();
    for (const p of raw.data?.points ?? []) {
      const i = Math.min(BUCKETS - 1, Math.floor(((p.ts - winStart.getTime()) / span) * BUCKETS));
      if (i >= 0) counts[i] += 1;
      if (p.ts > lastTs) lastTs = p.ts;
    }
    // W2: when the raw page is CAPPED (hasMore), samples past the last fetched
    // timestamp were never read — those buckets are UNKNOWN, not empty. Painting
    // them grey made the back two-thirds of a 24h window look like a storage gap
    // while the legend swore grey meant "no stored samples".
    const capped = raw.data?.hasMore === true;
    const fetchedUpTo = capped
      ? Math.min(BUCKETS - 1, Math.floor(((lastTs - winStart.getTime()) / span) * BUCKETS))
      : BUCKETS - 1;
    const expectedPerBucket = span / 1000 / gridPeriodS / BUCKETS;
    return counts.map((c, i) => ({
      count: c,
      ratio: expectedPerBucket > 0 ? c / expectedPerBucket : 0,
      fetched: i <= fetchedUpTo,
    }));
  }, [raw.data, gridPeriodS, winStart?.getTime(), winEnd?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps -- Date identity is unstable; time values are the real deps

  /** Spoken form of the density strip — see the role="img" below. */
  const densitySummary = useMemo(() => {
    if (density.length === 0) return 'Sample density unavailable.';
    const fetched = density.filter(b => b.fetched);
    const empty = fetched.filter(b => b.count === 0).length;
    const sparse = fetched.filter(b => b.count > 0 && b.ratio < 0.6).length;
    const unfetched = density.length - fetched.length;
    return `Sample density across ${density.length} buckets: `
      + `${fetched.length - empty - sparse} at or near the sample budget, `
      + `${sparse} sparse, ${empty} empty`
      + (unfetched ? `, ${unfetched} not fetched so coverage is unknown` : '') + '.';
  }, [density]);

  const rawCapped = raw.data?.hasMore === true;
  const expectedSamples = Math.round(profileS / gridPeriodS);

  return (
    <>
      <section className="cpm-surface">
        <div className="cpm-toolbar" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <ObcButton variant="normal" onClick={onBack}>‹ All {profile} windows</ObcButton>
          <div>
            <span className="cpm-eyebrow">Window {index + 1} of {loaded} loaded · {profile} · {loopId}</span>
            <h2 className="cpm-panel-title">
              {selected.window_end ? fmtDateTime(selected.window_end) : '—'}
            </h2>
            <div className="cpm-event-row__sub">
              {selected.window_start ? `from ${fmtDateTime(selected.window_start)} · ` : ''}
              emitted {fmtDateTime(selected.created_at)}
            </div>
          </div>
          <div className="cpm-filter-row">
            <CpmIconButton label="Newer window" disabled={!newer}
              onClick={() => { if (newer?.window_end) onSelect(newer.window_end); }}>
              <ObiChevronLeftGoogle />
            </CpmIconButton>
            <CpmIconButton label="Older window" disabled={!older}
              onClick={() => { if (older?.window_end) onSelect(older.window_end); }}>
              <ObiChevronRightGoogle />
            </CpmIconButton>
          </div>
        </div>
      </section>

      <WindowResultsPanel row={selected} tier={isLong ? 'long' : 'short'} />

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Window metadata" title="Contract for the selected window" />
          <KvRow label="Boundaries">
            <span className="cpm-mono">
              [{selected.window_start ? fmtDateTime(selected.window_start) : '—'},{' '}
              {selected.window_end ? fmtDateTime(selected.window_end) : '—'})
            </span>
          </KvRow>
          {/* Size/slide and lateness come from the served contract. The hardcoded
              text once claimed every window was "tumbling — no overlap" (true only of
              1m — the other five short kinds are sliding) and that short-tier lateness
              was "watermark-bounded" (each branch sets an explicit 30s…3min). */}
          <KvRow label="Size / slide">
            {spec
              ? `${fmtWindowShape(spec)}${spec.overlapping ? ' — overlapping' : ' — no overlap'}`
              : '—'}
          </KvRow>
          <KvRow label="Expected samples">
            {(() => {
              // The engine publishes the real per-window sample period; this
              // panel used to assume a 5 s grid for every loop.
              const served = typeof selected.expected_sample_count === 'number'
                ? selected.expected_sample_count : null;
              const period = typeof selected.sample_period_sec === 'number'
                ? selected.sample_period_sec : null;
              if (served != null) {
                return `${served.toLocaleString()}${period ? ` (${period} s grid)` : ''}`;
              }
              return `${expectedSamples.toLocaleString()} (assumed ${SAMPLE_PERIOD_S} s grid — engine did not report one)`;
            })()}
          </KvRow>
          <KvRow label="Actual samples">
            {fmtBytesless(typeof selected.sample_count === 'number' ? selected.sample_count : null)}
          </KvRow>
          <KvRow label="Completeness">
            {(() => { const c = completenessOf(selected, profileS); return c != null ? `${(c * 100).toFixed(1)}%` : '—'; })()}
          </KvRow>
          <KvRow label="Allowed lateness">
            {spec?.allowedLatenessMs != null
              ? `${fmtDuration(spec.allowedLatenessMs)} (event-time)`
              : spec?.cadenceMs != null
                ? `n/a — recomputed every ${fmtDuration(spec.cadenceMs)} from a retained buffer`
                : '—'}
          </KvRow>
          {spec?.minSamples != null && (
            <KvRow label="Minimum samples">
              {spec.minSamples} — a slice below this is not emitted at all
            </KvRow>
          )}
          <KvRow label="Late events">— (DG-4: not recorded by the jobs)</KvRow>
          <KvRow label="Out-of-order events">— (DG-4: not recorded by the jobs)</KvRow>
          {/* W6: the inspector was a dead end — an incomplete window found here
              could go nowhere. Both targets take the window's own bounds: Historical
              for KPI/diagnosis context, Trend PINNED to the exact range. */}
          {winStart && winEnd && (
            <div className="cpm-filter-row" style={{ marginTop: 12 }}>
              <ObcButton variant="raised" onClick={() => {
                const q = new URLSearchParams({
                  loop: loopId,
                  from: winStart.toISOString(),
                  to: winEnd.toISOString(),
                });
                navigate(`/cpm/historical?${q.toString()}`);
              }}>
                Open range in Historical ›
              </ObcButton>
              {(() => {
                const href = loop ? loopTrendHref(loop.tags, '8h', { from: winStart, to: winEnd }) : null;
                return href && (
                  <ObcButton variant="normal" onClick={() => navigate(href)}>
                    Open in Trend ›
                  </ObcButton>
                );
              })()}
            </div>
          )}
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="Sample density" title="Raw historian coverage across the window"
            right={raw.data ? <span className="cpm-copy">{raw.data.count.toLocaleString()} raw points{rawCapped ? ' (first page)' : ''}</span> : undefined} />
          {raw.isLoading && <EmptyState title="Counting raw samples…" />}
          {raw.isError && (
            <QueryError title="Raw slice unavailable"
              error={raw.error} retry={() => void raw.refetch()} />
          )}
          {!raw.isLoading && !raw.isError && density.length === 0 && (
            <EmptyState title="No raw slice available"
              copy="This window has no stored historian data to count per bucket." />
          )}
          {density.length > 0 && (
            <>
              <div className="cpm-density" role="img" aria-label={densitySummary}>
                {density.map((b, i) => (
                  <div key={i}
                    className={`cpm-density__bucket${
                      !b.fetched ? ' cpm-density__bucket--unfetched'
                        : b.count === 0 ? ' cpm-density__bucket--empty'
                        : b.ratio < 0.6 ? ' cpm-density__bucket--sparse' : ''}`}
                    style={{ height: !b.fetched ? '100%' : `${Math.max(4, Math.min(100, b.ratio * 100))}%` }}
                    title={!b.fetched
                      ? 'not fetched — beyond the raw page cap, unknown coverage'
                      : `${b.count} sample(s) · ${(b.ratio * 100).toFixed(0)}% of the ${gridPeriodS} s-grid expectation`} />
                ))}
              </div>
              <p className="cpm-copy">
                {BUCKETS} buckets · full-height = 100% of the {gridPeriodS} s-grid budget
                {gridIsServed ? ' (engine-reported)' : ' (assumed)'} · amber = sparse · grey = empty
                {rawCapped ? ' · hatched = not fetched (raw page cap) — unknown, not missing' : ''}.
                {' '}Bad-quality exclusion counts live in the G0 result, not the historian, and are not double-counted here.
              </p>
            </>
          )}

          {/* Boundary behaviour differs per assigner: a sliding window does NOT start
              empty — it shares samples with its neighbours — and the long tier is not a
              Flink window at all but a retained buffer resliced on a timer. */}
          <PanelHead eyebrow="Window contract" title="What happens at each boundary" />
          <div className="cpm-window-rows">
            <div className="cpm-window-row">
              <strong>On open</strong>
              <span className="cpm-event-row__sub">
                {spec?.assigner === 'sliding'
                  ? `overlaps the previous window by ${fmtDuration(spec.sizeMs - (spec.slideMs ?? 0))} — samples are shared, not dropped`
                  : spec?.assigner === 'rolling-buffer'
                    ? 'no open/close — a slice is taken from the retained buffer'
                    : 'all prior samples dropped (tumbling)'}
              </span>
              <span className="cpm-event-row__sub">
                {spec?.assigner === 'tumbling' ? '→ empty accumulator' : '→ shared history'}
              </span>
            </div>
            <div className="cpm-window-row">
              <strong>While open</strong>
              <span className="cpm-event-row__sub">samples accumulate at the loop's publish rate</span>
              <span className="cpm-event-row__sub">→ up to {expectedSamples.toLocaleString()} added</span>
            </div>
            <div className="cpm-window-row">
              <strong>On close</strong>
              <span className="cpm-event-row__sub">
                {spec?.cadenceMs != null
                  ? `event-time timer fires every ${fmtDuration(spec.cadenceMs)}`
                  : spec?.allowedLatenessMs != null
                    ? `watermark passes window end, then ${fmtDuration(spec.allowedLatenessMs)} of lateness is still accepted`
                    : 'watermark passes window end'}
              </span>
              <span className="cpm-event-row__sub">
                {spec?.minSamples != null
                  ? `→ one result if ≥ ${spec.minSamples} samples, else nothing`
                  : '→ one result emitted, nothing retained'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {shortSpecs.length > 0 && (
        <CompareAcrossKinds loopId={loopId} shortSpecs={shortSpecs} activeKind={profile} onPickKind={onPickKind} />
      )}
    </>
  );
};

export default WindowDetail;
