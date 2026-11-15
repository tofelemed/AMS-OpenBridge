/**
 * Task 16: the Workbench's Proof tab. The inputs the gate was computed from, then the run's own artifacts or the state that says
 * why there are none. CHG-162 (owner review): the window and its samples are in the page's foot strip, and the two links that
 * repeated the tabs above went. CHG-187 (owner review 11.1, 11.2): the inputs are a shared data table, Measure · Value with the
 * unit beside the number, the calculation's code and meaning in the row's ? tip; an input a KPI card above already shows is not
 * listed again. "Measured vs required" and "What remains open" moved to the gate head's dialog. "Evidence not kept" is the
 * head's label, so the tab adds no note for it; its charts leave out the "drawn sampled" note.
 */
import React from 'react';
import type { EvidenceManifest, MethodRun } from '../../../../api/cpm/evidence';
import { EvidenceArtifactRenderer } from '../EvidenceArtifactRenderer';
import { GateResultStatePanel, type GateState } from '../GateResultState';
import { ChartSampleNote } from '../CpmChart';
import { useFusedRow } from '../useFusedRow';
import { DataTable, type Column } from '../../../../ui/DataTable';
import { Toggletip } from '../../../../ui/Toggletip';
import { METRICS } from '../../calcCatalogue';
import { proofRows, type ProofRow } from './proofRows';

export interface ProofTabProps {
  gate: string;
  run: MethodRun | undefined;
  manifest: EvidenceManifest | undefined;
  state: GateState;
  timeZone: string;
  timeFmt: (ms: number) => string;
  /** The metric fields the gate's KPI cards show, left out of the table. */
  shownFields?: ReadonlySet<string>;
  onRetry: () => void;
  onGoToLatest?: () => void;
  onNavigateGate: (gate: string) => void;
}

const DESCRIPTION = new Map(METRICS.map(m => [m.id, m.description]));

/** A count needs no unit beside it ("8,641", not "8,641 count"). */
const valueText = (r: ProofRow) => (r.unit && r.unit !== 'count' ? `${r.value} ${r.unit}` : r.value);

const COLUMNS: Array<Column<ProofRow>> = [
  {
    key: 'measure', header: 'Measure',
    cell: r => (
      <span className="cpm-proof__measure">
        {r.name}
        {r.id && (
          <Toggletip variant="how-to" label={r.name}>
            {DESCRIPTION.get(r.id) && <p>{DESCRIPTION.get(r.id)}</p>}
            <p>Calculation {r.id}</p>
          </Toggletip>
        )}
      </span>
    ),
  },
  { key: 'value', header: 'Value', align: 'end', cell: valueText },
];

export const ProofTab: React.FC<ProofTabProps> = ({ gate, run, manifest, state, timeZone, timeFmt, shownFields, onRetry, onGoToLatest, onNavigateGate }) => {
  const { row } = useFusedRow(run?.loopId, run);
  const all = run ? proofRows(gate, run, row) : [];
  const rows = all.filter(r => !(r.field && shownFields?.has(r.field)));
  const notKept = state.kind === 'NOT_RETAINED';
  return (
    <div className="cpm-workbench__tab" aria-busy={state.kind === 'LOADING'}>
      {rows.length > 0 && <DataTable caption={`Inputs of ${gate}`} columns={COLUMNS} rows={rows} rowKey={r => r.id ?? r.name} />}
      {state.kind === 'READY' && manifest ? (
        <ChartSampleNote.Provider value={false}>
          <EvidenceArtifactRenderer gate={gate} manifest={manifest} timeZone={timeZone} timeFmt={timeFmt} onNavigateGate={onNavigateGate} />
        </ChartSampleNote.Provider>
      ) : state.kind === 'LOADING' ? (
        <div className="cpm-skeleton cpm-skeleton--evidence"><span className="cpm-skeleton__label">Loading the evidence…</span></div>
      ) : notKept ? (
        // an empty tab says so: no inputs at all, or every input is a card above and no chart was kept
        rows.length === 0 && <p className="cpm-metric-na">{all.length === 0 ? 'No inputs are stored for this gate, and its evidence was not kept.' : 'No charts for this run.'}</p>
      ) : (
        <GateResultStatePanel state={state} onRetry={onRetry} onGoToLatest={onGoToLatest} />
      )}
    </div>
  );
};

export default ProofTab;
