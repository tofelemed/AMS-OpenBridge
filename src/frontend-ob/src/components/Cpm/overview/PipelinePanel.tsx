'use client';

/**
 * Live Flink runtime panel: CPLM job states plus the served window contract,
 * rendered as a tiered ladder rather than the four hardcoded rows it replaced.
 */
import React, { useMemo } from 'react';
import { KpiTile, PanelHead, TonePill, fmtDuration, fmtWindowLateness, fmtWindowShape, QueryError, windowSpecsOf } from '../shared';
import { useCpmPipelineStatus, useCpmResolutions } from '../../../hooks/useCpm';


// ── live pipeline panel ────────────────────────────────────────────────────

/**
 * Position of a window size on the ladder's shared axis. Log-scaled because the
 * tiers span 1 minute to 24 hours: on a linear axis every short window would be an
 * invisible sliver against 24h, which is the opposite of showing the range.
 */
const LADDER_MIN_MS = 60_000;
const LADDER_MAX_MS = 24 * 3_600_000;
const spanPct = (ms: number): number => {
  if (!(ms > 0)) return 0;
  const clamped = Math.min(Math.max(ms, LADDER_MIN_MS), LADDER_MAX_MS);
  const pct = (Math.log(clamped / LADDER_MIN_MS) / Math.log(LADDER_MAX_MS / LADDER_MIN_MS)) * 100;
  return Math.max(3, Math.min(100, pct)); // floor so the 1m bar is still visible
};

/** Human tier titles; anything unexpected from the API falls back to its own key. */
const TIER_TITLES: Record<string, string> = {
  short: 'Short features · G0–G4',
  long: 'Long diagnostics · G5–G11',
};

export const PipelinePanel: React.FC = () => {
  const pipeline = useCpmPipelineStatus();
  const jobs = pipeline.data?.jobs ?? [];
  const cplmJobs = jobs.filter(j => j.role === 'cplm');
  // The ladder was four hardcoded rows that named ONE of the five sliding short
  // windows ("5 min / 1 min slide") and omitted 10m/2m, 15m/5m, 30m/5m, 60m/5m —
  // so it read as though the short tier had two windows when it has six, all six
  // of which produce stored rows. It now renders the served contract.
  const resolutions = useCpmResolutions();
  // Names-only fallback if the API predates the contract, so the ladder still
  // lists every window kind instead of collapsing to nothing.
  const windows = windowSpecsOf(resolutions.data, () => 0);
  const fusion = resolutions.data?.fusion;

  // Group by tier and hoist whatever every row in the tier shares into its head.
  // Computed, not hardcoded: if the server later gives 12h a different cadence,
  // the caption drops back onto the rows instead of quietly becoming wrong.
  const tiers = useMemo(() => {
    const order = ['short', 'long'];
    const keys = [...new Set(windows.map(w => w.tier))]
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    return keys.map(key => {
      const rows = windows.filter(w => w.tier === key);
      const uniq = <T,>(vals: T[]) => [...new Set(vals)];
      const feeds = uniq(rows.map(r => r.feeds).filter(Boolean));
      const cadences = uniq(rows.map(r => r.cadenceMs).filter((v): v is number => v != null));
      const minSamples = uniq(rows.map(r => r.minSamples).filter((v): v is number => v != null));
      // What got hoisted, so the rows can suppress exactly those facts.
      const hoisted = {
        cadence: cadences.length === 1 && rows.every(r => r.cadenceMs != null),
        minSamples: minSamples.length === 1 && rows.every(r => r.minSamples != null),
      };
      const shared = [
        hoisted.cadence ? `${fmtDuration(cadences[0])} cadence` : null,
        hoisted.minSamples ? `needs ≥ ${minSamples[0]} samples` : null,
        feeds.length === 1 ? `→ ${feeds[0]}` : null,
      ].filter(Boolean).join(' · ');
      return { key, title: TIER_TITLES[key] ?? key, rows, shared, hoisted };
    });
  }, [windows]);

  return (
    <section className="cpm-surface">
      <PanelHead
        eyebrow="Live Flink runtime"
        title="How the current result is being produced"
        right={pipeline.data
          ? <TonePill tone={pipeline.data.cplmRunning ? 'good' : 'bad'}>
              {pipeline.data.cplmRunning ? 'CPLM PIPELINE RUNNING' : 'CPLM PIPELINE DEGRADED'}
            </TonePill>
          : <TonePill tone="muted">CHECKING…</TonePill>}
      />
      {/* The old copy said these metrics "await the Flink metrics proxy". The proxy
          shipped (/pipeline-metrics) and deliberately reports watermark lag,
          events/s and backpressure as unavailable rather than estimating them — so
          the promise was of something that had been decided against. */}
      <p className="cpm-copy">
        A continuously running event-time pipeline — there is no report schedule or “run” button.
        Job states below are live; checkpoint health is on Pipeline Health. Watermark lag,
        events/s and backpressure are not reported — Flink does not expose them cheaply per
        record, and an estimate would read as a measurement.
      </p>
      <div className="cpm-kpi-row" style={{ margin: '12px 0' }}>
        {cplmJobs.map(j => (
          <KpiTile key={j.name} caption={j.name.replace('AMS - ', '')}
            tone={j.running ? 'good' : 'bad'}
            value={j.state} />
        ))}
      </div>
      {/* Reference material — collapsed by default so the live job states above
          stay the focus. */}
      <details className="cpm-window-disclosure">
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--element-active-color)', padding: '4px 0' }}>
          How the analysis windows work
        </summary>
        <div className="cpm-window-rows" style={{ marginTop: 8 }}>
          {resolutions.isError && (
            <QueryError title="Window contract unavailable"
              error={resolutions.error} retry={() => void resolutions.refetch()} />
          )}
          {tiers.map(tier => (
            <div key={tier.key} className="cpm-window-tier">
              <div className="cpm-window-tier__head">
                <span className="cpm-eyebrow">{tier.title}</span>
                {/* Facts shared by every row in this tier, stated once instead of
                    repeated down the column. */}
                {tier.shared && <span className="cpm-event-row__sub">{tier.shared}</span>}
              </div>
              <div className="cpm-window-tier__rows">
                {tier.rows.map(w => {
                  // Anything hoisted into the tier head is suppressed here — the
                  // first cut printed cadence and the min-sample floor in BOTH
                  // places, which is the repetition the grouping existed to remove.
                  const shape = fmtWindowShape(w, { omitCadence: tier.hoisted.cadence });
                  const qualifier = w.allowedLatenessMs != null
                    ? `${fmtDuration(w.allowedLatenessMs)} allowed lateness`
                    : tier.hoisted.minSamples ? '' : fmtWindowLateness(w) ?? '';
                  return (
                    <div key={w.kind} className="cpm-window-lrow">
                      <strong className="cpm-window-lrow__kind">{w.kind}</strong>
                      <span className="cpm-window-scale" aria-hidden="true"
                        title={`${w.kind} span`}>
                        <span className="cpm-window-scale__fill"
                          style={{ width: `${spanPct(w.sizeMs)}%` }} />
                        {w.slideMs != null && (
                          <span className="cpm-window-scale__slide"
                            style={{ width: `${spanPct(w.slideMs)}%` }} />
                        )}
                      </span>
                      <span className="cpm-event-row__sub">
                        {shape || 'shape not reported by this API version'}
                        {/* Overlap belongs beside the shape that causes it, and
                            must not displace the lateness column. */}
                        {w.slideMs != null ? ` · ${fmtDuration(w.sizeMs - w.slideMs)} overlap` : ''}
                      </span>
                      <span className="cpm-event-row__sub">{qualifier}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {fusion && (
            <div className="cpm-window-tier">
              <div className="cpm-window-tier__head">
                <span className="cpm-eyebrow">Fused verdict · G12–G15</span>
                <span className="cpm-event-row__sub">{fusion.produces}</span>
              </div>
              <div className="cpm-window-tier__rows">
                <div className="cpm-window-lrow cpm-window-lrow--fusion">
                  <strong className="cpm-window-lrow__kind">fusion</strong>
                  <span className="cpm-window-scale" aria-hidden="true">
                    <span className="cpm-window-scale__fill" style={{ width: '100%' }} />
                  </span>
                  <span className="cpm-event-row__sub">
                    fires on {fusion.firesOn.join(' & ')} records
                  </span>
                  <span className="cpm-event-row__sub">no window of its own</span>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* The min-sample floor is the usual answer to "why is there no verdict?",
            and no screen stated it before. */}
        {fusion && <p className="cpm-copy" style={{ marginTop: 8 }}>{fusion.note}</p>}
      </details>
    </section>
  );
};

export default PipelinePanel;
