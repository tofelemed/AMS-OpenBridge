// CHG-197 (owner rule "technical text should be removed", as CHG-193 / CHG-195): the residual panel of Fit quality in plain
// words: no step codes, no snake_case keys, no engine codes; the residuals in the loop's PV unit. CSV keys unchanged.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { decoded } from '../evidence/views/fixtures';
import { ResidualPanel } from './ResidualPanel';

const options: Array<{ series: Array<{ name: string }>; yAxis: Array<{ name: string }>; xAxis: { name: string } }> = [];
vi.mock('echarts-for-react', () => ({ default: (p: { option: never }) => { options.push(p.option); return React.createElement('div'); } }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode }) => React.createElement('button', null, p.children),
}));
afterEach(() => { cleanup(); options.length = 0; });

describe('ResidualPanel in plain words', () => {
  it('names the validation rows and values in words and draws the residuals in the PV unit', () => {
    const residuals = decoded({ gate: 'G12', kind: 'residuals', x: [1, 2, 3], y: [0.1, -0.1, 0], yUnit: 'PV_EU' });
    const acf = decoded({ gate: 'G12', kind: 'residual_acf', x: [0, 1, 2], y: [1, 0.4, 0.1], xUnit: 'samples', yUnit: 'dimensionless' });
    render(<ResidualPanel residuals={residuals} acf={acf} timeZone="UTC" pvUnit="m3/h"
      validation={{ state: 'VALIDATED', outputs: { verdict: 'PASS', free_run_rmse: 0.123456, residual_bias: 0.01 } }} />);
    const text = document.body.textContent ?? '';
    for (const words of ['Step E', 'State', 'Validated', 'Verdict', 'Pass', 'Free-run error (RMSE)', '0.123', 'Residual bias']) expect(text).toContain(words);
    expect(text).not.toMatch(/Subgate|VALIDATED|PASS|free_run_rmse|residual_bias/);
    const [res, ac] = options;
    expect(res.series[0].name).toBe('Residual (PV − model)');
    expect(res.yAxis[0].name).toBe('m3/h');
    expect(ac.series[0].name).toBe('Autocorrelation');
    expect(ac.xAxis.name).toBe('Lag (samples)');
  });
});
