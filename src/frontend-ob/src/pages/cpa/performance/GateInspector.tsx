/**
 * SPEC §5.2 inspector, cell selected: the gate, its result for this loop and window, the deciding
 * values against their thresholds, the effect on the verdict, and one primary action, Open evidence.
 * A verdict is a state the service reports, so "no window yet" and "the request failed" stay apart
 * from "not evaluated".
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { ApiError } from '../../../api/apiFetch';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { reasonSentence } from '../../../components/Cpm/evidence/verdictCopy';
import { gateName } from '../../../components/Cpm/gateStatus';
import { effectiveInputFlags } from '../../../components/Cpm/inputLimits';
import { flagsForLoop, inputContextOf } from '../../../components/Cpm/optionalInputs';
import { staleVerdictLine } from '../../../components/Cpm/verdictAge';
import { codeLabel } from '../../../components/Cpm/vocabulary';
import { siteDateTime } from '../../../cpa/siteTime';
import { useCpmCalculations, useCpmLoop, useGateCatalogue, useLatestGates } from '../../../hooks/useCpm';
import { Button } from '../../../ui/Button';
import { DataState } from '../../../ui/DataState';
import { GateBadge } from '../../../ui/GateBadge';
import { Inspector } from '../../../ui/Inspector';
import { StatusBadge } from '../../../ui/StatusBadge';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { Toggletip } from '../../../ui/Toggletip';
import { effectOnVerdict, exclusionLabel } from './performanceModel';
import { useDecidingValues } from './useDecidingValues';

const NOT_A_MEASUREMENT = 'This gate reports a state, not a measured value against a threshold.';

const GateNav: React.FC<{ gate: string; gateKeys: string[]; onSelectGate: (gate: string) => void; onClear: () => void }> = ({ gate, gateKeys, onSelectGate, onClear }) => {
  const at = gateKeys.indexOf(gate);
  const prev = at > 0 ? gateKeys[at - 1] : null;
  const next = at >= 0 && at < gateKeys.length - 1 ? gateKeys[at + 1] : null;
  const step = (name: string, target: string | null, icon: React.ReactNode) => (
    <button
      type="button"
      className="ui-control ui-control--icon"
      aria-label={target ? `${name}, ${gateName(target)} · ${target}` : `${name}: none`}
      aria-disabled={!target || undefined}
      onClick={() => { if (target) onSelectGate(target); }}
    >
      <span className="ui-icon ui-icon--small">{icon}</span>
    </button>
  );
  return (
    <div className="perf-inspector__nav">
      {step('Previous gate', prev, <ObiChevronLeftGoogle />)}
      {step('Next gate', next, <ObiChevronRightGoogle />)}
      <button type="button" className="ui-control ui-control--ghost" onClick={onClear}>Clear selection</button>
    </div>
  );
};

const Section: React.FC<{ title: string; help?: React.ReactNode; children: React.ReactNode }> = ({ title, help, children }) => (
  <section className="perf-inspector__section">
    <h3 className="perf-inspector__heading">{title}{help}</h3>
    {children}
  </section>
);

const DecidingValues: React.FC<{ rows: ReturnType<typeof useDecidingValues>['rows']; loading: boolean }> = ({ rows, loading }) => {
  if (loading) return <DataState kind="loading" label="Loading the thresholds that applied" rows={2} />;
  if (rows.length === 0) return <p className="perf-inspector__text">{NOT_A_MEASUREMENT}</p>;
  return (
    <dl className="perf-facts">
      {rows.map(r => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            <span>{r.value}</span>
            {r.against && <span className="ui-meta">{r.against}</span>}
            {r.ok != null && <StatusBadge tone={r.ok ? 'neutral' : 'danger'}>{r.ok ? 'Met' : 'Not met'}</StatusBadge>}
          </dd>
        </div>
      ))}
    </dl>
  );
};

const WindowFacts: React.FC<{ matrix: CpmGateMatrix; zoneId: string; role: string | null }> = ({ matrix, zoneId, role }) => {
  const older = staleVerdictLine(matrix.lastVerdict);
  return (
    <dl className="perf-facts">
      <div><dt>Window from</dt><dd>{siteDateTime(matrix.windowStart, zoneId)}</dd></div>
      <div><dt>Window to</dt><dd>{siteDateTime(matrix.windowEnd, zoneId)}</dd></div>
      {older && <div><dt>Last verdict</dt><dd>{older.replace(/^last verdict /, '')}</dd></div>}
      <div><dt>Gate role</dt><dd>{role ? codeLabel(role) : '—'}</dd></div>
      <div><dt>Samples</dt><dd>{matrix.sampleCount ?? '—'}</dd></div>
    </dl>
  );
};

export const GateInspector: React.FC<{
  loopId: string;
  gate: string;
  kind: string;
  gateKeys: string[];
  /** The loop's row in the matrix, when the server sent one. */
  row: CpmHeatmapLoop | undefined;
  /** False when the current filters hide the loop from the table. */
  inRows: boolean;
  zoneId: string;
  search: URLSearchParams;
  onSelectGate: (gate: string) => void;
  onClear: () => void;
  onShowAll: () => void;
}> = ({ loopId, gate, kind, gateKeys, row, inRows, zoneId, search, onSelectGate, onClear, onShowAll }) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loopId, kind);
  const inputs = inputContextOf(useCpmLoop(loopId).data);
  const catalogue = useGateCatalogue();
  const calculations = useCpmCalculations();

  const matrix = gates.data;
  const cell = matrix?.gates.find(g => g.key === gate);
  const runId = cell?.methodRunId ?? row?.methodRunIds?.[gate] ?? null;
  const definition = calculations.data?.gates.find(g => g.key === gate);
  const entry = catalogue.data?.gates.find(g => g.gate === gate);
  const role = entry?.role ?? null;
  const deciding = useDecidingValues(matrix, gate, runId);

  // A 404 is an answer: this loop has no window of this kind yet.
  const noWindow = gates.isError && gates.error instanceof ApiError && gates.error.status === 404;
  const failed = gates.isError && !noWindow;
  const status = cell?.status ?? row?.gates[gate] ?? null;
  const flags = effectiveInputFlags(matrix?.observabilityFlags ?? row?.observabilityFlags, inputs);
  const shownFlags = flagsForLoop(matrix?.observabilityFlags, inputs);
  const reason = cell?.reason ? reasonSentence(cell.reason, { gate, eligibilityDetail: matrix?.methodEligibility?.[gate]?.detail }) : null;
  const excluded = (status ?? '').toUpperCase().startsWith('EXCLUDED') ? exclusionLabel(status) : null;
  const effect = effectOnVerdict(gate, role, matrix, inputs);

  const evidence = cpaHref('/cpm/evidence', search, {
    tab: 'gates', loop: loopId, gate, window: kind, kind, methodRun: runId, mode: runId ? 'FIXED' : null,
  });
  const evidenceTab = (tab: string, extra: Record<string, string | null | undefined>) =>
    cpaHref('/cpm/evidence', search, { tab, loop: loopId, gate, kind, window: null, ...extra });

  const primary = (
    <Button
      variant="primary"
      disabled={noWindow}
      reason={noWindow ? `No ${kind} window has been evaluated for this loop yet` : undefined}
      onClick={() => navigate(evidence)}
    >
      Open evidence
    </Button>
  );

  return (
    <Inspector title={`${gateName(gate)} · ${gate}`} open onClose={onClear} primaryAction={primary}>
      <div className="perf-inspector">
        <GateNav gate={gate} gateKeys={gateKeys} onSelectGate={onSelectGate} onClear={onClear} />
        <p className="perf-inspector__loop">
          <span className="perf-code">{loopId}</span>
          {row?.displayName && <span>{row.displayName}</span>}
        </p>
        {!inRows && (
          <p className="ui-meta">
            This loop is not in the rows shown.{' '}
            <button type="button" className="ui-link" onClick={onShowAll}>Show all rows</button>
          </p>
        )}

        <Section title="Result" help={<Toggletip metric="M-044" label="Gate result" />}>
          {gates.isLoading && !status && <DataState kind="loading" label="Loading the result" rows={1} />}
          {failed && <DataState kind="error" error={gates.error} onRetry={() => { void gates.refetch(); }} />}
          {noWindow && <DataState kind="empty" title="No evaluated window" reason={`This loop has not completed a ${kind} evaluation window.`} />}
          {!failed && !noWindow && (status || !gates.isLoading) && <GateBadge status={status} gate={gate} inputFlags={flags} />}
          {excluded && <p className="perf-inspector__text">{excluded}</p>}
          {reason && <p className="perf-inspector__text">{reason}</p>}
          {matrix && <WindowFacts matrix={matrix} zoneId={zoneId} role={role} />}
        </Section>

        {matrix && (
          <Section title="Deciding values">
            <DecidingValues rows={deciding.rows} loading={deciding.loading} />
            {deciding.config && <p className="ui-meta">Thresholds as in force at {siteDateTime(matrix.windowEnd, zoneId)}.</p>}
          </Section>
        )}

        <Section title="Effect on the verdict">
          <p className="perf-inspector__text">{effect ?? 'Unavailable'}</p>
        </Section>

        <Section title="What this gate asks">
          <p className="perf-inspector__text">{definition?.question ?? entry?.definition ?? 'Unavailable'}</p>
          {definition && !definition.observedInResults && (
            <p className="perf-inspector__text">
              <StatusBadge tone="unknown">Not yet observed</StatusBadge> No stored result has carried a status for this gate yet.
            </p>
          )}
        </Section>

        {shownFlags.length > 0 && (
          <Section title="Flags on this window">
            <div className="perf-inspector__flags">
              {shownFlags.map(f => <StatusBadge key={f} tone={f.startsWith('HAS_') ? 'neutral' : 'warning'}>{codeLabel(f)}</StatusBadge>)}
            </div>
          </Section>
        )}

        {!runId && !gates.isLoading && !noWindow && (
          <p className="ui-meta">This result has no stored run. Evidence opens the newest window that has one.</p>
        )}

        <div className="perf-inspector__links">
          <Link className="ui-link" to={cpaHref('/cpm/loop', search, { loop: loopId, tab: 'performance', window: kind })}>Open loop</Link>
          <Link className="ui-link" to={evidenceTab('replay', { window: matrix?.windowEnd })}>Replay</Link>
          <Link className="ui-link" to={evidenceTab('windows', { profile: kind })}>Windows</Link>
          <Link className="ui-link" to={evidenceTab('calculations', { window: kind })}>Calculations</Link>
        </div>

        <TechnicalDetails
          items={[
            { label: 'Method run', value: runId },
            { label: 'Calculation version', value: matrix?.metadata.calculationVersion },
            { label: 'Dynamics profile version', value: matrix?.metadata.dynamicsProfileVersion },
            { label: 'Calculation source', value: matrix?.metadata.calculationSource, mono: false },
            { label: 'Threshold profile', value: deciding.config?.profileId },
            { label: 'Threshold bundle version', value: deciding.config?.bundle?.version },
            { label: 'Computed', value: matrix ? siteDateTime(matrix.metadata.computedAt, zoneId) : null, mono: false },
          ]}
        />
      </div>
    </Inspector>
  );
};
