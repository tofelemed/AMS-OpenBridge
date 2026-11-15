// CHG-200 (final test #5, #6, #7; controller C6, C7, C9): System Response in plain words and readable numbers. No exponent anywhere
// the user reads (result card, tables, dialog), large numbers grouped, very small ones as "< 0.0001", units in typographic form
// ("(m3/h)²·s", "m3/h·s²"), the ± never split from its number; no step codes, no |L(jω)|, no "dimensionless", no "fraction";
// quantity rows in the trends' words. The numbers stay the same (formatting only) and the CSV keys are unchanged.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { decoded } from '../evidence/views/fixtures';
import { BodePanel } from './BodePanel';
import { CandidateModelsTable } from './CandidateModelsTable';
import { ReportedQuantities } from './ResponseNotes';
import { ResidualPanel } from './ResidualPanel';
import { ResultCard } from './ResultCard';
import { StepsDataTab } from './StepsDataTab';
import { fmt, quantityText, typographicUnit } from './responseSupport';
import { result } from './trends/trendFixtures';

const options: Array<Record<string, unknown>> = [];
vi.mock('echarts-for-react', () => ({ default: (p: { option: Record<string, unknown> }) => { options.push(p.option); return React.createElement('div'); } }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({ ObcButton: (p: { children?: React.ReactNode }) => React.createElement('button', null, p.children) }));
afterEach(() => { cleanup(); options.length = 0; });

const q = (quantityId: string, value: number | null, unit = '', over: Partial<ResponseQuantity> = {}): ResponseQuantity => ({
  quantityId, value, unit, pathId: 'OP_TO_PV', uncertainty: null, method: 'OBSERVED_RESPONSE_V1', supportFromMs: 0, supportToMs: 205_000, configHash: 'b', reasonIfNull: '', ...over,
});
const NBSP = ' ';

describe('numbers and units in plain form', () => {
  it('never writes an exponent: small values as decimals or "< 0.0001", large ones grouped', () => {
    expect(fmt(6.4351e-3)).toBe('0.00644');
    expect(fmt(2.996e-4)).toBe('0.0003');
    expect(fmt(5.101e-6)).toBe(`<${NBSP}0.0001`);
    expect(fmt(8.312e6)).toBe('8,312,000');
    expect(fmt(2678.58)).toBe('2,679');
    expect(fmt(3.97)).toBe('3.97');
  });

  it('writes units in typographic form and drops unit words that are not units', () => {
    expect(typographicUnit('PV_EU^2*s')).toBe('(PV_EU)²·s');
    expect(typographicUnit('PV_EU*s^2')).toBe('PV_EU·s²');
    expect(typographicUnit('PV_EU/(input_EU*s)')).toBe('PV_EU/(input_EU·s)');
    for (const u of ['fraction', 'dimensionless', '1']) expect(typographicUnit(u)).toBe('');
  });

  it('keeps the ± with its number', () => {
    expect(quantityText(q('process_gain', 3, 'PV_EU/input_EU', { uncertainty: 5.101e-6 }))).toBe(`3.00 PV_EU/input_EU${NBSP}±${NBSP}<${NBSP}0.0001`);
  });
});

describe('System Response tables and cards in plain words', () => {
  const metrics = [
    q('process_gain', 3, 'PV_EU/input_EU', { uncertainty: 5.101e-6, method: 'MODEL_FOPDT' }), q('t63', 24.04, 's'),
    q('iae', 2678.58, 'PV_EU*s'), q('ise', 37927.62, 'PV_EU^2*s'), q('itae', 307041.7, 'PV_EU*s^2'), q('mae_time', 13.06, 'PV_EU'),
    q('rmse_time', 14.2, 'PV_EU'), q('prediction_rmse', 6.4351e-3, 'PV_EU'), q('fit_improvement', 1, 'fraction'), q('t10', 6, 's'), q('t50', 14, 's'),
  ];

  it('the result card writes the ± in readable form on one line', () => {
    render(<ResultCard result={result()} metrics={metrics} loading={false} pvUnit="kg/h" />);
    const spread = document.querySelector('.cpm-response-param__spread')!.textContent;
    expect(spread).toBe(`±${NBSP}<${NBSP}0.0001`);
    expect(document.body.textContent).not.toMatch(/\de[-+]\d/);
  });

  it('Reported quantities: the trends’ words and typographic units', () => {
    render(<ReportedQuantities metrics={metrics} pvUnit="kg/h" />);
    const rows = screen.getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toContain('63 % time24.04 s');
    expect(rows).toContain('IAE2,679 kg/h·s');
    expect(rows).toContain('ISE37,928 (kg/h)²·s');
    expect(rows).toContain('ITAE307,042 kg/h·s²');
  });

  it('Steps & data: every quantity named in words, no unit word that is not a unit, the support in normal figures', () => {
    render(<StepsDataTab result={result()} metrics={metrics} timeZone="UTC" pvUnit="kg/h" />);
    const table = screen.getByRole('table');
    const text = table.textContent ?? '';
    for (const words of ['Mean absolute error', 'RMS error', 'Prediction RMS error', 'Fit improvement', '10 % time', '50 % time', '63 % time', '0.00644 kg/h']) expect(text).toContain(words);
    expect(text).not.toMatch(/Mae time|Rmse time|Prediction rmse|fraction|\^|\*|\de[-+]\d|t63|t10/);
    expect(within(table).getAllByText('205 s')[0].closest('td')?.className ?? '').not.toMatch(/mono/);
  });
});

describe('Fit quality and Frequency in plain words', () => {
  it('Candidate models: no step code or method pill, the path in words, the condition number rounded, every parameter named', () => {
    const table = decoded({ gate: 'G12', kind: 'candidate_models', role: 'OP_TO_PV', x: [0], y: [5.156e-7], yUnit: 'PV_EU^2', provenance: {
      state: 'ESTIMATED', rows: 'FOPDT(fit: gain=3.0, theta=3.97, tau=20.0) bounds_hit=false flat_delay=true sign_uncertain=false cond=11.775364368273369',
    } });
    const intervals = decoded({ gate: 'G12', kind: 'parameter_intervals', x: [0, 1], y: [5.101e-6, 1.867e-5], provenance: { parameters: 'process_gain;baseline', method: 'COVARIANCE', theta_uncertainty_s: '2.5' } });
    render(<CandidateModelsTable table={table} delayCurve={undefined} intervals={intervals} rejections={undefined} pvUnit="kg/h" />);
    const text = document.body.textContent ?? '';
    for (const words of ['OP → PV', 'Condition number 11.8', 'Baseline', 'Fit error, (kg/h)²']) expect(text).toContain(words);
    expect(text).not.toMatch(/Step D|Covariance|FIT|11\.775|baseline|\(\(|\de[-+]\d/);
  });

  it('Residuals: no step code, the validation rows one per line', () => {
    render(<ResidualPanel residuals={decoded({ gate: 'G12', kind: 'residuals', x: [1, 2], y: [0, 1] })} acf={decoded({ gate: 'G12', kind: 'residual_acf', x: [0, 1], y: [1, 0.5], yUnit: 'dimensionless' })}
      timeZone="UTC" validation={{ state: 'EVALUATED', outputs: { verdict: 'VALIDATED' } }} pvUnit="kg/h" />);
    expect(document.body.textContent).not.toMatch(/Step E|dimensionless/);
    expect(document.querySelector('.cpm-response-quantities--rows')).not.toBeNull();
  });

  it('Frequency: loop gain and loop phase in words on a log frequency axis, no "dimensionless", the safety sentence once', () => {
    const bode = decoded({ gate: 'G12', kind: 'bode', x: [0.01, 0.1, 1], y: [10, 1, 0.1], xUnit: 'rad/s', yUnit: 'dimensionless',
      columns: { phase_deg: [-90, -135, -200] }, units: { phase_deg: 'degree' }, provenance: { note: 'MODEL_DOMAIN_ESTIMATE_NOT_A_SAFETY_GUARANTEE' } });
    render(<BodePanel bode={bode} metrics={[q('gain_margin', 6.2, 'dB')]} controller={undefined} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Loop gain');
    expect(text).toContain('Loop phase');
    expect(text).not.toMatch(/Subgate|\|L|∠L|dimensionless/);
    expect(text.match(/not a safety guarantee/g)).toHaveLength(1);
    const gain = options[0] as { xAxis: { type: string }; series: Array<{ name: string }> };
    expect(gain.xAxis.type).toBe('log');
    expect(gain.series[0].name).toBe('Loop gain');
  });
});
