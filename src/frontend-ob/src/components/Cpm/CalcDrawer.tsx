'use client';

/**
 * U9 calculation drawer — one metric's definition, provenance and history.
 *
 * Placement: it was `.cpm-drawer`, fixed to top:0/right:0, which is where the
 * app top bar and the live-events rail sit — so the panel's own title and Close
 * button were occluded, and with the whole panel as a single scroll box, Close
 * scrolled away as soon as you read past the fold. It now uses the shared
 * inspector shell (sticky header, scrolling body) as a centred modal, with
 * prev/next so the catalogue can be walked without closing.
 *
 * It stays a MODAL rather than docking beside the table (unlike the Performance
 * evidence panel): this is a definition lookup, not a comparison across a row,
 * and the catalogue table is already six columns wide.
 */
import React, { useMemo, useState } from 'react';
import { ObcTabRow } from '@oicl/openbridge-webcomponents-react/components/tab-row/tab-row';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import {
  CpmIconButton, EmptyState, KvRow, PanelHead, QueryError, TonePill, fmtDateTime,
} from './shared';
import { useCpmEvents } from '../../hooks/useCpm';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import type {
  CpmCalculations as CpmCatalogue, CpmGateMatrix, CpmKpiRow,
} from '../../api/cpmApi';
import type { MetricDef } from './calcCatalogue';

const DRAWER_TABS = ['Definition', 'Validation', 'History'] as const;

export const CalcDrawer: React.FC<{
  metric: MetricDef;
  loopId: string;
  value: number | null;
  status: { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' };
  disqualification: string | null;
  windowEnd: string | null;
  /** The served catalogue — engine, deployed versions, gate coverage, bands. */
  catalogue: CpmCatalogue | undefined;
  /** The fused window this loop's gate assessment came from. */
  gateMatrix: CpmGateMatrix | undefined;
  /** The feature row the value itself was read from (undefined for gate-sourced). */
  row: CpmKpiRow | undefined;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}> = ({
  metric, loopId, value, status, disqualification, windowEnd,
  catalogue, gateMatrix, row, onPrev, onNext, onClose,
}) => {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const [tab, setTab] = useState<typeof DRAWER_TABS[number]>('Definition');
  // sort:'recent' — this tab is a timeline labelled by opened_at; the server's
  // triage default would list highest-confidence episodes as if newest (B1).
  const events = useCpmEvents({ loopId, openOnly: false, limit: 10, sort: 'recent' });

  const tabs = useMemo(
    () => DRAWER_TABS.map(t => ({ id: t, title: t, hasLeadingIcon: false })), []);

  return (
    <>
      <div className="cpm-modal-backdrop" onClick={onClose} />
      {/*
        Was `.cpm-drawer` — fixed to top:0/right:0, which is where the app top
        bar and the live-events rail sit, so the panel's own title and Close
        button were occluded; and with the whole panel as one scroll box, Close
        scrolled away as soon as you read past the fold. It now uses the shared
        inspector shell: a sticky header that cannot scroll out of reach, a
        scrolling body under it, and prev/next so you can walk the catalogue
        without closing and re-opening.
      */}
      <div
        ref={dialogRef}
        className="cpm-inspector cpm-inspector--modal cpm-inspector--wide"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={`${metric.id} ${metric.name}`}
      >
        <div className="cpm-inspector__head">
          <div className="cpm-inspector__title">
            <span className="cpm-eyebrow">{loopId} · {metric.id} · {metric.gate}</span>
            <h2 className="cpm-panel-title">{metric.name}</h2>
          </div>
          <div className="cpm-inspector__nav">
            <CpmIconButton label="Previous calculation" disabled={!onPrev}
              onClick={() => onPrev?.()}>
              <ObiChevronLeftGoogle />
            </CpmIconButton>
            <CpmIconButton label="Next calculation" disabled={!onNext}
              onClick={() => onNext?.()}>
              <ObiChevronRightGoogle />
            </CpmIconButton>
            <CpmIconButton label="Close calculation details" onClick={onClose}>
              <ObiCloseGoogle />
            </CpmIconButton>
          </div>
        </div>
        <div className="cpm-inspector__body">
        <div className="cpm-kpi-row" style={{ margin: '0 0 12px' }}>
          <div className={`cpm-kpi cpm-kpi--${disqualification ? 'warn' : status.tone}`}>
            <span className="cpm-kpi__caption">Latest value</span>
            <span className="cpm-kpi__value">
              {disqualification ? '— (declined)' : value != null ? `${value.toFixed(3)} ${metric.unit}` : '—'}
            </span>
            <span className="cpm-kpi__sub">
              {disqualification ?? status.label}
              {windowEnd ? ` · window ends ${fmtDateTime(windowEnd)}` : ''}
            </span>
          </div>
        </div>

        {/* `hug` is required: obc-tab-item is a fixed 240px wide, so three tabs
            demand 720px and would overflow the panel. */}
        <div className="cpm-tabs">
          <ObcTabRow
            hug
            tabs={tabs}
            selectedTabId={tab}
            onTabSelected={(e: CustomEvent<{ id: string }>) => {
              const id = e.detail.id as typeof DRAWER_TABS[number];
              if (DRAWER_TABS.includes(id)) setTab(id);
            }}
          />
        </div>

        {tab === 'Definition' && (
          <>
            <p className="cpm-copy">{metric.description}</p>
            <PanelHead eyebrow="Runtime configuration" title="Contract" />
            <KvRow label="Loop">{loopId}</KvRow>
            <KvRow label="Gate">{metric.gate}</KvRow>
            <KvRow label="Kind">{metric.kind}</KvRow>
            <KvRow label="Stored in">{metric.source === 'short' ? 'cplm_short_feature_results' : metric.source === 'long' ? 'cplm_long_feature_results' : 'cplm_gate_results'}</KvRow>
            <KvRow label="Output unit">{metric.unit}</KvRow>
            {/* "Apache Flink · event time" was a literal; the catalogue names
                the engine that actually produced these rows. */}
            <KvRow label="Engine">{catalogue?.engine ?? '—'}</KvRow>
            <KvRow label="Calculation version">
              {gateMatrix?.metadata.calculationVersion ?? catalogue?.calculationVersion ?? '—'}
            </KvRow>
            <KvRow label="Dynamics profile">
              {gateMatrix?.metadata.dynamicsProfileVersion ?? catalogue?.dynamicsProfileVersion ?? '—'}
            </KvRow>
          </>
        )}

        {/*
          Every row here used to be a literal: "CI-gated (Cplm*Test, 30
          assertions)" and "Upsert on (loop, window, source)" were identical for
          every metric on every loop, asserted claims about the build and the
          schema that no API reports and this screen cannot check. They are
          replaced by provenance the served payloads actually carry — including
          the one check worth having, which the hardcoded panel could never make:
          whether the engine version that produced THIS value still matches the
          version now deployed.
        */}
        {tab === 'Validation' && (() => {
          const rowVersion = typeof row?.calculation_version === 'string'
            ? row.calculation_version : null;
          const stampedVersion = rowVersion ?? gateMatrix?.metadata.calculationVersion ?? null;
          const deployed = catalogue?.calculationVersion ?? null;
          const stale = !!stampedVersion && !!deployed && stampedVersion !== deployed;
          const gateDef = catalogue?.gates.find(g => g.key === metric.gate);
          const qualified = metric.source === 'short'
            ? (typeof row?.sufficient_data === 'boolean' ? row.sufficient_data : null)
            : metric.source === 'long'
              ? (typeof row?.long_metrics_qualified === 'boolean' ? row.long_metrics_qualified : null)
              : null;
          const emittedAt = metric.source === 'gate'
            ? gateMatrix?.metadata.computedAt ?? null
            : (typeof row?.created_at === 'string' ? row.created_at : null);
          const samples = metric.source === 'gate'
            ? gateMatrix?.sampleCount ?? null
            : (typeof row?.sample_count === 'number' ? row.sample_count : null);
          // Only the fused-confidence metric sits on the band scale.
          const band = metric.source === 'gate' && value != null
            ? [...(catalogue?.bands ?? [])]
              .sort((a, b) => a.maxConfidence - b.maxConfidence)
              .find(b => value <= b.maxConfidence) ?? null
            : null;

          return (
            <>
              <PanelHead eyebrow="Provenance" title="What produced this value" />
              <KvRow label="Engine">
                {gateMatrix?.metadata.calculationSource ?? catalogue?.engine ?? '—'}
              </KvRow>
              <KvRow label="Emitted">{emittedAt ? fmtDateTime(emittedAt) : '—'}</KvRow>
              <KvRow label="Window">
                {windowEnd ? `ends ${fmtDateTime(windowEnd)}` : '—'}
              </KvRow>
              <KvRow label="Samples in window">
                {samples != null ? samples.toLocaleString() : '—'}
              </KvRow>

              <PanelHead eyebrow="Version" title="Is this value current?" />
              <KvRow label="Stamped on this value">
                {stampedVersion
                  ? <TonePill tone={stale ? 'warn' : 'good'}>v{stampedVersion}</TonePill>
                  : <TonePill tone="muted">not stamped</TonePill>}
              </KvRow>
              <KvRow label="Deployed now">
                {deployed ? `v${deployed}` : '—'}
              </KvRow>
              {stale && (
                <p className="cpm-copy">
                  This value was produced by v{stampedVersion}, but the engine now deployed is
                  v{deployed} — recompute the window before citing it as current evidence.
                </p>
              )}
              {!stampedVersion && (
                <p className="cpm-copy">
                  No calculation version is stored on this row, so it cannot be attributed to a
                  specific engine build.
                </p>
              )}

              <PanelHead eyebrow="Coverage" title="Has this been produced before?" />
              <KvRow label={`Gate ${metric.gate} in stored results`}>
                {gateDef
                  ? <TonePill tone={gateDef.observedInResults ? 'good' : 'warn'}>
                    {gateDef.observedInResults ? 'Observed' : 'Never observed'}
                  </TonePill>
                  : <TonePill tone="muted">not in the catalogue</TonePill>}
              </KvRow>
              <KvRow label="Window qualification">
                {qualified == null
                  ? <TonePill tone="muted">no flag on this row</TonePill>
                  : <TonePill tone={qualified ? 'good' : 'warn'}>
                    {qualified ? 'Qualified' : 'Unqualified'}
                  </TonePill>}
              </KvRow>
              {disqualification && <p className="cpm-copy">{disqualification}</p>}
              {band && (
                <KvRow label="Confidence band">
                  {band.band} <span className="cpm-event-row__sub">
                    (≤ {(band.maxConfidence * 100).toFixed(0)}%)
                  </span>
                </KvRow>
              )}
              {catalogue?.note && <p className="cpm-copy">{catalogue.note}</p>}

              <p className="cpm-copy" style={{ marginTop: 12 }}>
                Regression coverage and storage idempotency are properties of the build and the
                schema. No API reports them, so this panel does not claim them.
              </p>
            </>
          );
        })()}

        {tab === 'History' && (
          <>
            <PanelHead eyebrow="Loop episodes" title="Recent diagnosis history" />
            {events.isLoading && <EmptyState title="Loading episodes…" />}
            {/* A failed events read is not an empty history — it used to render
                as "No episodes recorded", the same conflation the rest of this
                file is careful to avoid. */}
            {events.isError && (
              <QueryError title="Episode history unavailable"
                error={events.error} retry={() => void events.refetch()} />
            )}
            {!events.isLoading && !events.isError
              && (events.data?.events ?? []).length === 0 && (
              <EmptyState title="No episodes recorded" />
            )}
            {(events.data?.events ?? []).map(e => (
              <KvRow key={e.id} label={fmtDateTime(e.opened_at)}>
                {e.peak_diagnosis.replace(/_/g, ' ')} · {(e.peak_confidence * 100).toFixed(0)}%
              </KvRow>
            ))}
          </>
        )}
        </div>
      </div>
    </>
  );
};


export default CalcDrawer;
