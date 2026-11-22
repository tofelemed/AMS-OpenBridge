/**
 * CHG-215 (System Response plan 2f): the controller tuning on the Frequency tab, read-only. The tuning this event ran under
 * (CENTUM P, I, D as the DCS sent them, from the result's controller_snapshot), the tuning advice when the engine gave one
 * (subgate H: SIMC, never applied, λ approved or the dead-time default), and the loop's tuning history (cplm-api CHG-107).
 * Values are shown as the DCS shows them: P as a proportional band in %, I and D in seconds, 0 or absent = off.
 */
import React from 'react';
import { PanelHead, TonePill } from '../shared';
import { DataTable, type Column } from '../../../ui/DataTable';
import type { ControllerTuningRow, ResponseSubgate } from '../../../api/cpm/response';
import { formatInZone } from '../evidence/timezone';
import { phrase } from '../vocabulary';
import { useControllerTuning } from './useResponse';

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A number from a record, by either spelling of its key; null when absent or not finite. */
export function numberOf(o: Record<string, unknown> | null | undefined, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

const tidy = (v: number) => String(Number(v.toPrecision(4)));
export const bandText = (p: number | null) => (p == null ? '—' : `${tidy(p)} %`);
export const timeText = (s: number | null) => (s == null || s <= 0 ? 'off' : `${tidy(s)} s`);

interface Row { label: string; value: string }
const COLUMNS: Array<Column<Row>> = [
  { key: 'item', header: 'Setting', cell: r => r.label },
  { key: 'value', header: 'Value', cell: r => r.value },
];

interface HistoryRow { id: string; from: string; to: string; p: string; i: string; d: string }
const HISTORY_COLUMNS: Array<Column<HistoryRow>> = [
  { key: 'from', header: 'From', mono: true, cell: r => <span className="cpm-nowrap">{r.from}</span> },
  { key: 'to', header: 'To', mono: true, cell: r => <span className="cpm-nowrap">{r.to}</span> },
  { key: 'p', header: 'P', cell: r => r.p },
  { key: 'i', header: 'I', cell: r => r.i },
  { key: 'd', header: 'D', cell: r => r.d },
];

const historyRow = (r: ControllerTuningRow, timeZone: string): HistoryRow => ({
  id: r.snapshotId,
  from: formatInZone(Date.parse(r.validFrom), timeZone),
  to: r.validTo ? formatInZone(Date.parse(r.validTo), timeZone) : 'in force',
  p: bandText(numberOf(r.native, 'raw_p', 'rawP')),
  i: timeText(numberOf(r.native, 'raw_i', 'rawI')),
  d: timeText(numberOf(r.native, 'raw_d', 'rawD')),
});

export const TuningPanel: React.FC<{
  loopId: string | undefined;
  snapshot: Record<string, unknown> | null | undefined;
  advice: ResponseSubgate | undefined;
  timeZone: string;
}> = ({ loopId, snapshot, advice, timeZone }) => {
  const history = useControllerTuning(loopId);
  const tuningRows: Row[] = snapshot ? [
    { label: 'P', value: bandText(numberOf(snapshot, 'raw_p')) },
    { label: 'I', value: timeText(numberOf(snapshot, 'raw_i')) },
    { label: 'D', value: timeText(numberOf(snapshot, 'raw_d')) },
    ...(typeof snapshot.effective_from === 'string' ? [{ label: 'Since', value: formatInZone(Date.parse(snapshot.effective_from), timeZone) }] : []),
  ] : [];
  const unusable = snapshot && snapshot.usable === false ? String(snapshot.reason ?? '') : '';
  const out = advice?.outputs ?? {};
  const advised = advice?.state === 'EVALUATED';
  const lambda = numberOf(out, 'lambda_s');
  const adviceRows: Row[] = advised ? [
    { label: 'P', value: bandText(numberOf(out, 'p_band_pct')) },
    { label: 'I', value: timeText(numberOf(out, 'ti_s')) },
    { label: 'D', value: timeText(numberOf(out, 'td_s')) },
    { label: 'λ', value: lambda == null ? '—' : `${tidy(lambda)} s · ${phrase(String(out.lambda_source ?? ''))}` },
  ] : [];
  const rows = (history.data?.history ?? []).map(r => historyRow(r, timeZone));
  return (
    <section className="cpm-surface cpm-response-sub cpm-response-tuning" aria-label="Controller tuning">
      <PanelHead title="Controller tuning" />
      {snapshot ? (
        <>
          <DataTable caption="Tuning this event ran under" columns={COLUMNS} rows={tuningRows} rowKey={r => r.label} />
          {unusable && <p className="cpm-copy">{sentence(phrase(unusable))}: the margins and the advice need it.</p>}
        </>
      ) : (
        <p className="cpm-copy">{sentence(phrase('CONTROLLER_FORM_UNKNOWN'))}.</p>
      )}
      {snapshot && (
        <>
          <PanelHead title="Tuning advice" right={advised ? <TonePill tone="warn">Advice only, never applied</TonePill> : undefined} />
          {advised
            ? <DataTable caption="Tuning advice for this model" columns={COLUMNS} rows={adviceRows} rowKey={r => r.label} />
            : <p className="cpm-copy">{sentence(phrase(String(out.reason ?? 'MODEL_NOT_VALIDATED')))}.</p>}
        </>
      )}
      {rows.length > 0 && (
        <>
          <PanelHead title="Tuning history" />
          <DataTable caption="Controller tuning history of this loop" columns={HISTORY_COLUMNS} rows={rows} rowKey={r => r.id} />
        </>
      )}
    </section>
  );
};

export default TuningPanel;
