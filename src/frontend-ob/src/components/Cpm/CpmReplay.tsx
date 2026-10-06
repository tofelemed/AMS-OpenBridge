'use client';

/**
 * CPLM Phase 7 — U8 Evidence replay (/cpm/replay?loop=&window=&gate=).
 * CPA-prototype IA parity: loop/window/gate toolbar, the transformation
 * stepper, an evidence chart over the real raw historian slice with a replay
 * cursor, a phase-plane variant for the shape gates, the summary aside from
 * the calculations catalogue + stored gate row, the input lineage strip, and
 * the A8 recompute integration (submit → poll → refetch gates). The engineer
 * note is stored honestly: it acknowledges the loop's open event frame with
 * the note attached — there is no other server-side note store.
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, PanelHead, TonePill, WorkspaceHeader,
  fmtDateTime, QueryError } from './shared';
import { LoopContextBar } from './context/LoopContextBar';
import { gateTone } from './gateStatus';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import LoopCombobox from './LoopCombobox';
import type { CpmGateMatrix, CpmKpiRow } from '../../api/cpmApi';
import { gateRole } from '../../api/cpm/catalogue';
import {
  useAcknowledgeEvent, useCpmCalculations, useCpmEvents, useCpmKpisRange,
  useCpmLoops, useGateCatalogue, useGateHistory, useRawSlice, useRecompute,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { ReplayChart } from './replay/ReplayChart';
import { TransformationStepper } from './replay/TransformationStepper';
import { LineageStrip } from './replay/LineageStrip';
import { diagnosisLabel, codeLabel, phrase } from './vocabulary';

/** Long-tier metric fields relevant per gate (real stored fields only). */
const GATE_METRICS: Record<string, { field: string; label: string }[]> = {
  G0: [{ field: 'completeness', label: 'Completeness' }, { field: 'sample_count', label: 'Sample count' }],
  G1: [{ field: 'auto_pct', label: 'AUTO fraction' }],
  G3: [{ field: 'mae', label: 'MAE' }, { field: 'iae', label: 'IAE' }, { field: 'good_error_pct', label: 'Good-error %' }],
  G4: [{ field: 'effort_ratio', label: 'Effort ratio' }, { field: 'reversals_per_hour', label: 'Reversals/h' }, { field: 'travel_per_day', label: 'Travel/day' }],
  G5: [{ field: 'acf_period_s', label: 'ACF period (s)' }, { field: 'acf_regularity', label: 'ACF regularity' }],
  G6: [{ field: 'harmonic_amplitude_ratio', label: 'Harmonic amplitude ratio' }, { field: 'harmonic_energy_ratio', label: 'Harmonic energy ratio' }],
  G7: [{ field: 'triangularity', label: 'OP triangularity' }],
  G8: [{ field: 'horch_oddness', label: 'Horch oddness' }],
  G9: [{ field: 'corner_score', label: 'Corner score' }],
};

/** Gates whose evidence is the PV–OP shape, shown as a phase plane. */
const SHAPE_GATES = new Set(['G7', 'G8', 'G9', 'G10']);

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const CpmReplay: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  // Plant scope (CPM-UX A1): narrows the loop picker to a section/unit.
  const scope = useCpmScope();
  // No default selection: registry order is arbitrary, so `loops[0]` is a
  // CHOICE presented as a default — the same lie the ?loop=-names-nothing
  // fallback was fixed for, minus the URL. It also fired this page's whole
  // query set for a loop nobody asked for.
  const loopId = params.get('loop') ?? undefined;
  const gateKey = params.get('gate') ?? 'G15';

  const calc = useCpmCalculations();
  const history = useGateHistory(loopId, '24h');
  const windows = useMemo(() => {
    const rows = history.data?.windows ?? [];
    return [...rows].sort((a, b) => (b.windowEnd ?? '').localeCompare(a.windowEnd ?? ''));
  }, [history.data]);
  const windowEnd = params.get('window');
  const selected: CpmGateMatrix | undefined =
    windows.find(w => w.windowEnd === windowEnd) ?? windows[0];
  // The deep-linked window may not be among the fetched newest 100 — keep the
  // fallback (a blank replay helps nobody) but SAY it happened rather than
  // silently replaying a different window than the link named.
  const windowFellBack = !!windowEnd && windows.length > 0
    && !windows.some(w => w.windowEnd === windowEnd);

  // The long-tier KPI row for the same 24h window carries the metric values.
  const kpiRow: CpmKpiRow | undefined = useCpmKpisRange(
    loopId, '24h',
    selected?.windowStart ?? undefined,
    // `to` is load-bearing, not decoration: the endpoint filters
    // window_end BETWEEN from AND to and then orders DESC LIMIT n, so leaving
    // `to` open asked for the ten NEWEST windows since this one — which drops
    // the selected window itself as soon as more than ten have been emitted
    // since. Every gate metric then read "no long-tier row for this window",
    // blaming the data for a query bug.
    selected?.windowEnd ?? undefined, 10,
    !!selected?.windowStart, // C: don't fire with from='' then refetch with the real window
  ).data?.samples.find(r => r.window_end === selected?.windowEnd);

  // Raw slice for the selected window (first page, ascending).
  const series = loopId ? loopSeries(loopId) : undefined;
  const winStart = selected?.windowStart ? new Date(selected.windowStart) : undefined;
  const winEnd = selected?.windowEnd ? new Date(selected.windowEnd) : undefined;
  // v2.5 (2E.2): the slice is walked page by page (each below IoTDB's REST row limit) until
  // the window is complete or the 200k-point budget is reached - and a cut is SAID, never implied.
  const raw = useRawSlice(series, winStart, winEnd, 'pv,sp,op,vp', 9_000, 200_000);
  const points = useMemo(() => raw.data?.points ?? [], [raw.data]);
  const [cursorPct, setCursorPct] = useState(100);
  const loop = loops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const timeZone = loop?.timezone || 'UTC';
  const catalogue = useGateCatalogue();

  /**
   * Gate options come from the served catalogue; when that read fails, the
   * SELECTED WINDOW already carries its own gate cells (key + name), so the
   * picker falls back to those rather than to a hardcoded list. Real data from
   * a second source beats inventing gate names client-side, and it keeps replay
   * usable through a catalogue outage.
   */
  const gatesFromWindow = calc.isError && (selected?.gates.length ?? 0) > 0;
  const gateOptions = useMemo(
    () => (calc.data?.gates ?? []).map(g => ({ key: g.key, name: g.name }))
      .concat(calc.data ? [] : (selected?.gates ?? []).map(g => ({ key: g.key, name: g.name }))),
    [calc.data, selected]);

  const def = calc.data?.gates.find(g => g.key === gateKey);
  const cell = selected?.gates.find(g => g.key === gateKey);
  // the role comes from the build's catalogue (2D.1); '—' until it is fetched, never a guessed table
  const role = gateRole(catalogue.data, gateKey);
  const isShapeGate = SHAPE_GATES.has(gateKey);
  const gridS = typeof kpiRow?.sample_period_sec === 'number' ? kpiRow.sample_period_sec : null;

  // A8 recompute round trip.
  const { submit, status, reset } = useRecompute(loopId);
  const recomputeBusy = submit.isPending || (status != null && !status.finished);

  // Engineer note → acknowledge the loop's open event frame with the note.
  const events = useCpmEvents({ loopId, openOnly: true, limit: 5 }, 60_000, !!loopId); // C
  const openFrame = events.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED');
  const ack = useAcknowledgeEvent();
  const [note, setNote] = useState('');

  const exportPackage = () => {
    if (!selected) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    download(`cplm-replay-${loopId}-${gateKey}-${stamp}.json`, JSON.stringify({
      loopId,
      gate: gateKey,
      window: { start: selected.windowStart, end: selected.windowEnd, kind: selected.windowKind },
      verdict: {
        diagnosis: selected.diagnosis, severity: selected.severity,
        confidence: selected.confidence, gates: selected.gates,
      },
      metadata: selected.metadata,
      metrics: kpiRow ?? null,
      rawSlice: { series, count: points.length, truncated: raw.data?.truncated ?? false, points },
    }, null, 2));
  };

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/replay"
        title="Evidence replay"
        actions={
          <ObcButton variant="normal" disabled={!selected} onClick={exportPackage}>
            Export package
          </ObcButton>
        }
      />
      <LoopContextBar loopId={loopId} period={selected ? { label: '24h fused window', start: selected.windowStart, end: selected.windowEnd } : null} />

      <section className="cpm-surface">
        <PlantScopeFilter scope={scope} />
        <div className="cpm-toolbar">
          <LoopCombobox scope={scope} loops={loops} value={loopId ?? ''}
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; }, { replace: true })}
            onClear={() => setParams(p => { p.delete('loop'); p.delete('window'); return p; }, { replace: true })} />
          {/*
            These two selects DEPEND on the one above: no loop means no window
            list, and no window means the gate fallback has nothing to read. An
            empty <select> states none of that — it just looks broken, which is
            exactly what it looked like once the arbitrary default selection was
            removed. Each now carries a disabled option naming what is missing.
          */}
          <label className="cpm-field">
            <span className="cpm-field__label">Evaluated window (24h)</span>
            <select className="cpm-select" value={selected?.windowEnd ?? ''}
              disabled={windows.length === 0}
              onChange={e => setParams(p => { p.set('window', e.target.value); return p; }, { replace: true })}>
              {windows.length === 0 && (
                <option value="">
                  {!loopId ? 'Select a loop first'
                    : history.isLoading ? 'Loading windows…'
                      : history.isError ? 'Window list unavailable'
                        : 'No evaluated 24h windows for this loop'}
                </option>
              )}
              {windows.map(w => (
                <option key={w.windowEnd ?? ''} value={w.windowEnd ?? ''}>
                  ends {w.windowEnd ? fmtDateTime(w.windowEnd) : '—'} · {diagnosisLabel(w.diagnosis)}
                </option>
              ))}
            </select>
          </label>
          <label className="cpm-field">
            <span className="cpm-field__label">Gate</span>
            <select className="cpm-select" value={gateKey}
              disabled={gateOptions.length === 0}
              onChange={e => setParams(p => { p.set('gate', e.target.value); return p; }, { replace: true })}>
              {gateOptions.length === 0 && (
                <option value="">
                  {calc.isLoading ? 'Loading gates…'
                    : !loopId ? 'Select a loop first'
                      : 'Gate list unavailable'}
                </option>
              )}
              {gateOptions.map(g => (
                <option key={g.key} value={g.key}>{g.key} · {g.name}</option>
              ))}
            </select>
          </label>
          {/* R8: a failed catalogue read left this select silently EMPTY. It now
              falls back to the window's own gate cells and offers a retry, so a
              catalogue outage degrades the labels rather than blocking replay. */}
          {calc.isError && (
            <span className="cpm-replay-catalogue-note">
              <span className="cpm-field__error">
                {gatesFromWindow
                  ? 'Gate catalogue unavailable — listing the gates this window evaluated instead.'
                  : 'Gate catalogue unavailable.'}
              </span>
              <ObcButton variant="flat" onClick={() => void calc.refetch()}>Retry</ObcButton>
            </span>
          )}
          <TonePill tone="muted">{role}</TonePill>
          {cell && <TonePill tone={gateTone(cell.status)}>{codeLabel(cell.status)}</TonePill>}
        </div>

        <TransformationStepper gridS={gridS} hasVerdict={!!selected} phasePlane={isShapeGate} />

        {windowFellBack && (
          <p className="cpm-copy" role="status">
            The window this link pointed at is not among the fetched results —
            replaying the newest evaluated window instead.
          </p>
        )}
        {!loopId && (
          <EmptyState title="Select a loop"
            copy="Replay walks the exact samples one evaluation window used — pick a loop above to begin." />
        )}
        {history.isError && <QueryError title="Gate history unavailable" error={history.error} retry={() => void history.refetch()} />}
        {loopId && !selected && !history.isLoading && !history.isError && (
          <EmptyState title="No evaluated 24h windows for this loop"
            copy="Replay needs a stored fused result; run the loop long enough to complete a window, or recompute from history." />
        )}
        {raw.isLoading && <EmptyState title="Loading raw slice…" />}
        {raw.isError && (
          <QueryError title="Raw slice unavailable"
            error={raw.error} retry={() => void raw.refetch()} />
        )}
        {selected && !raw.isLoading && !raw.isError && points.length === 0 && (
          <EmptyState title="No raw historian data for this window"
            copy={`Nothing stored at ${series} between the window bounds.`} />
        )}
        {points.length > 0 && (
          <ReplayChart points={points} pvUnit={loop?.engineering?.pvUnit ?? ''} phasePlane={isShapeGate} cursorPct={cursorPct} onCursor={setCursorPct}
            truncated={raw.data?.truncated ?? false} timeZone={timeZone} />
        )}
      </section>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Summary" title={def ? `${gateKey} · ${def.name}` : gateKey} />
          <KvRow label="Question">{def?.question ?? '—'}</KvRow>
          <KvRow label="Result">
            <TonePill tone={gateTone(cell?.status)}>{codeLabel(cell?.status ?? 'NOT_EVALUATED')}</TonePill>
          </KvRow>
          {cell?.reason && <KvRow label="Reason">{cell.reason}</KvRow>}
          <KvRow label="Window">
            {selected?.windowStart ? fmtDateTime(selected.windowStart) : '—'} →{' '}
            {selected?.windowEnd ? fmtDateTime(selected.windowEnd) : '—'}
          </KvRow>
          <KvRow label="Samples">{selected?.sampleCount ?? '—'}</KvRow>
          <KvRow label="Calculation">
            v{selected?.metadata.calculationVersion ?? '—'} · profile v{selected?.metadata.dynamicsProfileVersion ?? '—'}
            {selected?.metadata.replayId ? ` · replay ${selected.metadata.replayId}` : ''}
          </KvRow>
          {(GATE_METRICS[gateKey] ?? []).map(m => (
            <KvRow key={m.field} label={m.label}>
              {kpiRow && typeof kpiRow[m.field] === 'number'
                ? (kpiRow[m.field] as number).toFixed(3)
                : '— (no long-tier row for this window)'}
            </KvRow>
          ))}

          <LineageStrip series={series} gridS={gridS} gateKey={gateKey} role={role} diagnosis={selected?.diagnosis} />
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="Re-run" title="Recompute this loop from history"
            right={status && (
              <TonePill tone={status.finished ? (status.succeeded ? 'good' : 'bad') : 'warn'}>
                {status.finished ? (status.succeeded ? 'FINISHED' : `FAILED (${status.state})`) : status.state}
              </TonePill>
            )} />
          <p className="cpm-copy">
            Submits the A8 historical replay job with this loop's current evidence flags and
            window alignment (~90 s round trip). Gate views refresh automatically when it finishes.
          </p>
          <div className="cpm-filter-row">
            <ObcButton variant="raised" disabled={!loopId || recomputeBusy}
              onClick={() => { reset(); submit.mutate(); }}>
              {recomputeBusy ? 'Recomputing…' : 'Re-run this window'}
            </ObcButton>
            {submit.isError && (
              <span className="cpm-field__error">
                Recompute failed to start: {(submit.error as Error)?.message ?? 'unknown error'}
              </span>
            )}
          </div>

          <PanelHead eyebrow="Engineer note" title="Record your finding" />
          {openFrame ? (
            <>
              <p className="cpm-copy">
                Notes attach by acknowledging the open event frame
                ({phrase(openFrame.family)} · opened {fmtDateTime(openFrame.opened_at)}).
              </p>
              <textarea className="cpm-textarea" rows={3} value={note}
                placeholder="What did the evidence show? What action was taken?"
                onChange={e => setNote(e.target.value)} />
              <div className="cpm-filter-row" style={{ marginTop: 8 }}>
                <ObcButton variant="raised" disabled={note.trim().length === 0 || ack.isPending}
                  onClick={() => ack.mutate({ id: openFrame.id, note: note.trim() }, { onSuccess: () => setNote('') })}>
                  {ack.isPending ? 'Saving…' : 'Acknowledge with note'}
                </ObcButton>
                {ack.isSuccess && <TonePill tone="good">SAVED</TonePill>}
                {ack.isError && (
                  <span className="cpm-field__error">
                    Failed: {(ack.error as Error)?.message ?? 'unknown error'}
                  </span>
                )}
              </div>
            </>
          ) : (
            <EmptyState title="No open event frame on this loop"
              copy="Notes are stored on event frames; when this loop has an unacknowledged event, the note box appears here." />
          )}
        </section>
      </div>
    </div>
  );
};

export default CpmReplay;
