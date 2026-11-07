// @vitest-environment jsdom
// Section 3 polish: the window's one reason is said once above the list; a gate word with no value reads plainly
// except Pass, which keeps "on other inputs".
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { METRICS } from '../calcCatalogue';
import type { MetricView } from './calcView';
import CalcList from './CalcList';
import GateResult from './GateResult';

afterEach(cleanup);

const WHY = 'computed on a window that failed data qualification';
const status = { label: 'Pass', tone: 'muted' as const, code: 'PASS', partial: false };
const row = (i: number, na: MetricView['na']): MetricView => ({ metric: METRICS[i], value: null, na, status });
const mount = (rows: MetricView[]) => render(<CalcList rows={rows} selectedId={undefined} onSelect={() => undefined} head={(_k, label) => <span>{label}</span>} />);

describe('CalcList window reason', () => {
  it('says a shared reason once and keeps the rows to the short word', () => {
    mount([row(0, { short: 'Insufficient data', reason: WHY }), row(1, { short: 'Insufficient data', reason: WHY }), row(2, { short: 'Insufficient data', reason: WHY })]);
    expect(screen.getAllByText(/failed data qualification/)).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Computed on a window that failed data qualification.');
    expect(screen.getAllByText('Insufficient data')).toHaveLength(3);
  });

  it('keeps a reason that belongs to one metric on its row', () => {
    mount([row(0, { short: 'Insufficient data', reason: WHY }), row(1, { short: 'Insufficient data', reason: WHY }), row(2, { short: 'Not calculated', reason: 'no clean oscillation cycle' })]);
    expect(screen.getByText('no clean oscillation cycle')).toBeTruthy();
    expect(screen.getAllByText(/failed data qualification/)).toHaveLength(1);
  });

  it('takes the most frequent reason across mixed short words and keeps another on its row', () => {
    mount([row(0, { short: 'Insufficient data', reason: WHY }), row(1, { short: 'Not calculated', reason: WHY }), row(2, { short: 'Not calculated', reason: WHY }),
      row(3, { short: 'Not calculated', reason: 'no oscillation period found' })]);
    expect(screen.getAllByText(/failed data qualification/)).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Computed on a window that failed data qualification.');
    expect(screen.getByText('no oscillation period found')).toBeTruthy();
    expect(screen.getAllByText('Not calculated')).toHaveLength(3);
  });

  it('keeps a lone reason on its row', () => {
    mount([row(0, { short: 'Insufficient data', reason: WHY })]);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(WHY)).toBeTruthy();
  });
});

describe('GateResult with no value', () => {
  const partial = (label: string, code: string) => ({ label, tone: 'muted' as const, code, partial: true });
  it('keeps "on other inputs" for Pass only', () => {
    render(<GateResult gate="G3" status={partial('Pass', 'PASS')} />);
    expect(screen.getByText('Pass on other inputs')).toBeTruthy();
  });
  it.each([['Not usable', 'FAIL'], ['Symptom seen', 'WARN']])('shows %s plainly', (label, code) => {
    render(<GateResult gate="G3" status={partial(label, code)} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(/on other inputs/)).toBeNull();
  });
});
