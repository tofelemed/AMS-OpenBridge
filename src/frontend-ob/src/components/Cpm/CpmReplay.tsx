'use client';

/**
 * Evidence Replay (/cpm/replay?loop=&window=&gate=&rerun=). The raw historian slice one evaluated window used, with our
 * cursor and a PV, SP, OP, Mode readout at it (no playback), five stage tabs, and the window's stored verdict. The window
 * is the one useWindowAt reads: the original result, or a re-run when ?rerun= names one. Seeking never changes a verdict.
 * Re-run sends the exact window as a new run (RerunCard); Evidence package and Run details are dialogs. The engineer note
 * is stored on the loop (LoopNotes).
 */
import { pipelineStep, usePipelineAccess } from './access';
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, useWindowKind } from './useWindowKind';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, TonePill, WorkspaceHeader, QueryError } from './shared';
import { LoopBand } from './context/LoopBand';
import { pipelineHref, registryHref, windowsHref } from './cpaHref';
import { REPLAY_UNAVAILABLE } from './evidence/runLinks';
import type { CpmGateMatrix, CpmKpiRow } from '../../api/cpmApi';
import { gateRole } from '../../api/cpm/catalogue';
import {
  useCpmCalculations, useCpmEvents, useCpmKpisRange,
  useCpmLoops, useGateCatalogue, useRawSlice,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { ReplayChart } from './replay/ReplayChart';
import { ReplayStages } from './replay/ReplayStages';
import { WindowVerdictCard } from './replay/WindowVerdictCard';
import { diagnosisLabel } from './vocabulary';
import { shortState, windowLabel, windowPick } from './windowLabel';
import { LoopNotes } from './investigation/LoopNotes';
import { ReasonedButton } from './ReasonedButton';
import { useEvidenceWindows } from './evidence/useEvidenceWindows';
import { EvidenceMore, EvidenceWindowSelect } from './evidence/EvidenceToolbar';
import { workbenchHref } from './evidence/selection';
import { sameInstant, useWindowAt } from './evidence/useWindowAt';
import { fmtInstant } from './context/LoopContextBar';
import { WindowResultSelect } from './replay/WindowResultSelect';
import { RerunCard } from './replay/RerunCard';
import { PackageDialog } from './replay/PackageDialog';
import { RunDetailsDialog } from './replay/RunDetailsDialog';

/** Gates whose evidence is the PV–OP shape, shown as a phase plane. */
const SHAPE_GATES = new Set(['G7', 'G8', 'G9', 'G10']);

export const CpmReplay: React.FC = () => {
  const navigate = useNavigate();
  const canPipeline = usePipelineAccess();
  const [params, setParams] = useSearchParams();
  // CHG-089: the fused window kind (?kind= as replayHref writes it; 12h default)
  const [windowKind] = useWindowKind('kind');
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  // No default selection: registry order is arbitrary, so `loops[0]` is a CHOICE presented as a default.
  const loopId = params.get('loop') ?? undefined;
  const gateKey = params.get('gate') ?? 'G15';

  const calc = useCpmCalculations();
  const loop = loops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const timeZone = loop?.timezone || 'UTC';
  // CHG-140: the list is the one Gates and Investigation read; the window is read at its exact end, a re-run included
  // (the original outranks a re-run of the same end). ?window= may carry a kind from another page: never an end then.
  // a kind Replay does not hold fetches nothing: the page says so below
  const askedKind = params.get('kind');
  const refused = !!askedKind && !(WINDOW_KINDS as readonly string[]).includes(askedKind);
  const fetchLoop = refused ? undefined : loopId;
  const list = useEvidenceWindows(fetchLoop, windowKind, 'fused', timeZone);
  const windows = list.options;
  const endParam = params.get('window');
  const windowEnd = endParam && !(WINDOW_KINDS as readonly string[]).includes(endParam) ? endParam : null;
  const rerunId = windowEnd ? params.get('rerun') : null;
  const at = useWindowAt(fetchLoop, windowKind, windowEnd, rerunId);
  const selected: CpmGateMatrix | undefined = at.row;
  const windowNotStored = !!windowEnd && at.notFound;
  const g15Run = selected?.methodRunIds?.G15;

  // The long-tier KPI row for the same fused window (12h / 24h) carries the metric values. `to` is load-bearing: the
  // endpoint orders DESC LIMIT n inside from..to, so an open `to` drops this window once ten newer ones exist.
  const kpiRow: CpmKpiRow | undefined = useCpmKpisRange(
    fetchLoop, windowKind,
    selected?.windowStart ?? undefined,
    selected?.windowEnd ?? undefined, 10,
    !!selected?.windowStart,
  ).data?.samples.find(r => sameInstant(r.window_end, selected?.windowEnd));

  // Raw slice for the selected window, walked page by page (each below IoTDB's REST row limit) until the window is
  // complete or the 200k-point budget is reached - and a cut is SAID, never implied. Mode comes with it; a blank reads Not recorded.
  const series = fetchLoop ? loopSeries(fetchLoop) : undefined;
  const winStart = selected?.windowStart ? new Date(selected.windowStart) : undefined;
  const winEnd = selected?.windowEnd ? new Date(selected.windowEnd) : undefined;
  const raw = useRawSlice(series, winStart, winEnd, 'pv,sp,op,vp,mode', 9_000, 200_000);
  const points = useMemo(() => raw.data?.points ?? [], [raw.data]);
  const [cursorPct, setCursorPct] = useState(100);
  const catalogue = useGateCatalogue();

  // Gate options come from the served catalogue; when that read fails the SELECTED WINDOW's own gate cells stand in.
  const gatesFromWindow = calc.isError && (selected?.gates.length ?? 0) > 0;
  const gateOptions = useMemo(
    () => (calc.data?.gates ?? []).map(g => ({ key: g.key, name: g.name }))
      .concat(calc.data ? [] : (selected?.gates ?? []).map(g => ({ key: g.key, name: g.name }))),
    [calc.data, selected]);

  const def = calc.data?.gates.find(g => g.key === gateKey);
  // the role comes from the build's catalogue (2D.1); '—' until it is fetched, never a guessed table
  const role = gateRole(catalogue.data, gateKey);
  const isShapeGate = SHAPE_GATES.has(gateKey);
  const gridS = typeof selected?.metrics?.sample_period_sec === 'number' ? selected.metrics.sample_period_sec
    : typeof kpiRow?.sample_period_sec === 'number' ? kpiRow.sample_period_sec : null;

  const [dialog, setDialog] = useState<'package' | 'details' | null>(null);

  // The loop's open event frame: loop notes attach to it.
  const events = useCpmEvents({ loopId, openOnly: true, limit: 5 }, 60_000, !!fetchLoop);
  const openFrame = events.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED');

  const dropWindow = (p: URLSearchParams) => { p.delete('window'); p.delete('rerun'); };
  const catalogueError = calc.isError && (
    <span className="cpm-replay-catalogue-note">
      <span className="cpm-field__error">
        {gatesFromWindow ? 'Gate catalogue unavailable — listing the gates this window evaluated instead.' : 'Gate catalogue unavailable.'}
      </span>
      <ObcButton variant="flat" onClick={() => void calc.refetch()}>Retry</ObcButton>
    </span>
  );

  // A link may name a kind Replay does not hold (15m, 4h): say so, never show the 12h window in its place.
  if (refused) {
    return (
      <div className="cpm-screen">
        <WorkspaceHeader eyebrow="Understand the cause" title="Evidence Replay" />
        <section className="cpm-surface">
          <EmptyState title={REPLAY_UNAVAILABLE}
            copy={`Replay cannot open a ${askedKind} window. Open it in the Window Inspector, or replay a 12 h or 24 h window.`}
            action={{ label: 'Replay 12 h windows', onClick: () => setParams(p => { p.set('kind', '12h'); dropWindow(p); return p; }, { replace: true }) }}
            next={loopId ? [{ label: 'Window Inspector', to: windowsHref(loopId, { profile: askedKind, window: windowEnd }) }] : undefined} />
        </section>
      </div>
    );
  }

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Understand the cause"
        title="Evidence Replay"
        actions={<>
          <ReasonedButton variant="flat" disabled={!loopId || !g15Run} reason={!g15Run ? 'Select an evaluated window first' : null}
            onClick={() => { if (loopId && g15Run) navigate(workbenchHref(loopId, g15Run)); }}>
            Evidence Workbench ↗
          </ReasonedButton>
          <ReasonedButton variant="normal" disabled={!selected} reason={!selected ? 'Select an evaluated window first' : null} onClick={() => setDialog('package')}>
            Evidence package
          </ReasonedButton>
        </>}
      />
      <LoopBand loopId={loopId}
        onLoop={id => setParams(p => { p.set('loop', id); dropWindow(p); return p; }, { replace: true })}
        end={<>
          <WindowKindToggle value={windowKind} kinds={WINDOW_KINDS}
            // One write: two in a row both start from this render's address, so the second drops the first's kind.
            onChange={k => setParams(p => { p.set('kind', k); dropWindow(p); return p; }, { replace: true })} />
          <EvidenceMore loopId={loopId} kind={windowKind} windowsError={list.error} onRetryWindows={list.refetch}
            hasMore={list.hasMore} onLoadMore={list.loadMore} loadingMore={list.isLoadingMore} />
        </>}>
        <EvidenceWindowSelect loopId={loopId} kind={windowKind} windows={windows} windowsLoading={list.isLoading} windowsError={list.error}
          currentMethodRunId={g15Run} currentEnd={selected?.windowEnd}
          runWindow={selected ? `${windowPick(selected, timeZone)} · ${shortState(diagnosisLabel(selected.diagnosis))}` : null}
          onWindow={w => setParams(p => { p.set('window', w.windowEnd); p.delete('rerun'); return p; }, { replace: true })} />
        {selected && (
          <WindowResultSelect row={selected} others={at.others}
            onChange={id => setParams(p => { if (id) p.set('rerun', id); else p.delete('rerun'); if (!p.get('window') && selected.windowEnd) p.set('window', selected.windowEnd); return p; }, { replace: true })} />
        )}
      </LoopBand>

      {selected && (
        <div className="cpm-replay-identity cpm-copy">
          <TonePill tone="muted">{selected.metadata.replayId ? `Re-run ${selected.metadata.replayId}` : 'Original run · pinned'}</TonePill>
          <span>{selected.sampleCount != null ? `${selected.sampleCount.toLocaleString('en-US')} samples` : 'Samples not reported'}</span>
          <span>Calculation v{selected.metadata.calculationVersion ?? '—'} · profile v{selected.metadata.dynamicsProfileVersion ?? '—'}</span>
          <ObcButton variant="flat" onClick={() => setDialog('details')}>Run details ↗</ObcButton>
        </div>
      )}

      {windowNotStored && (
        <section className="cpm-surface">
          <EmptyState title="That window is not stored"
            copy={`The service holds no result for the ${windowKind} window ending ${fmtInstant(windowEnd, timeZone)}, so it cannot be replayed. Full gate results are kept for a limited time.`}
            action={{ label: 'Replay the newest window', onClick: () => setParams(p => { p.delete('window'); return p; }, { replace: true }) }} />
        </section>
      )}
      {!loopId && (
        <section className="cpm-surface">
          <EmptyState level={2} title="Select a loop"
            copy="Replay walks the exact samples one evaluation window used — pick a loop above to begin." />
        </section>
      )}
      {(list.error || at.isError) && <QueryError title="Gate history unavailable" error={at.isError ? at.error : list.error} retry={() => { if (at.isError) at.refetch(); else list.refetch(); }} />}
      {loopId && !selected && !at.isLoading && !at.isError && !windowNotStored && !list.isLoading && (
        // CHG-098 (SME review 2 #29): what to try — the other window size, or the engine.
        <section className="cpm-surface">
          <EmptyState title={`No evaluated ${windowKind} windows for this loop`}
            copy="Replay needs a stored result for a completed evaluation window, and this loop has none of this size yet. Switch 12 h / 24 h at the top of the page, or check Pipeline Health if a window is overdue."
            next={pipelineStep(canPipeline, pipelineHref())} />
        </section>
      )}

      {selected && (
        <div className="cpm-grid-2">
          <div className="cpm-replay-main">
            <section className="cpm-surface">
              <ReplayStages series={series} gridS={gridS} gateKey={gateKey} role={role}
                hasVerdict diagnosis={selected.diagnosis} phasePlane={isShapeGate} />
              {raw.isLoading && <EmptyState title="Loading raw slice…" />}
              {raw.isError && <QueryError title="Raw slice unavailable" error={raw.error} retry={() => void raw.refetch()} />}
              {!raw.isLoading && !raw.isError && points.length === 0 && (
                // CHG-098 (SME review 2 #29): plain cause, then the mapping; the historian series last.
                <EmptyState title="No raw historian data for this window"
                  copy={`No raw samples were stored for this loop between the window's start and end. Check its signal mapping in the Loop Registry, or pick another window. (Historian series: ${series})`}
                  next={loopId ? [{ label: 'Signal mapping in the Loop Registry', to: registryHref(loopId) }] : undefined} />
              )}
              {points.length > 0 && (
                <ReplayChart points={points} pvUnit={loop?.engineering?.pvUnit ?? ''} phasePlane={isShapeGate} cursorPct={cursorPct} onCursor={setCursorPct}
                  truncated={raw.data?.truncated ?? false} timeZone={timeZone} />
              )}
            </section>
          </div>
          <div className="cpm-replay-aside">
            {catalogueError}
            <WindowVerdictCard row={selected} loopId={loopId ?? ''} gateKey={gateKey} gateOptions={gateOptions} kpiRow={kpiRow}
              question={def?.question} onGate={g => setParams(p => { p.set('gate', g); return p; }, { replace: true })} />
            {loopId && (
              <RerunCard loopId={loopId} row={selected} timeZone={timeZone} />
            )}
          </div>
        </div>
      )}
      {selected && loopId && series && (
        <>
          <PackageDialog open={dialog === 'package'} onClose={() => setDialog(null)} loopId={loopId} loop={loop} row={selected} series={series} timeZone={timeZone} />
          <RunDetailsDialog open={dialog === 'details'} onClose={() => setDialog(null)} row={selected} timeZone={timeZone} />
        </>
      )}
      {/* SME #22 (CHG-058): loop notes replace "acknowledge with note" — a note never acknowledges by itself */}
      {loopId && (
        <LoopNotes loopId={loopId} openFrame={openFrame ?? null}
          window={selected ? { methodRunId: selected.methodRunIds?.G15 ?? null, label: windowLabel(selected) } : null} />
      )}
    </div>
  );
};

export default CpmReplay;
