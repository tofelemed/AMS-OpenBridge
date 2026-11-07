// CHG-141: Next checks are links, chosen by what the window is. Each one carries the same loop and window.
import { describe, expect, it } from 'vitest';
import type { CpmGateCell } from '../../../api/cpm/gates';
import { row } from '../evidence/windowFixtures';
import { nextChecks } from './nextChecks';

const END = '2026-11-05T10:15:00Z';
const START = '2026-11-04T22:15:00Z';
const cell = (key: string, status: string): CpmGateCell => ({ key, name: key, tier: 'short', status, reason: null });
const opts = { loopId: 'FIC10401', windowKind: '12h' };
const links = (m: ReturnType<typeof row>) => nextChecks(m, opts).map(c => c.link);

describe('nextChecks', () => {
  it('walks a finding through the signals, its gates and the cause', () => {
    const m = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', gates: [cell('G5', 'WARN'), cell('G9', 'WARN'), cell('G7', 'PASS')] });
    const checks = nextChecks(m, opts);
    expect(checks.map(c => c.label)).toEqual([
      'Compare PV, SP and OP over the same window', 'Inspect the checks contributing to this diagnosis', 'Review evidence for the physical cause',
    ]);
    expect(checks.map(c => c.link)).toEqual(['Signals ↗', 'G5 / G9 ↗', 'Hypotheses ↗']);
    expect(checks[1].action).toEqual({ kind: 'gate', gate: 'G5' });
  });

  it('falls back to the performance gates, then the decision, when no symptom gate spoke', () => {
    const perf = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', gates: [cell('G3', 'FAIL'), cell('G4', 'PASS')] });
    expect(links(perf)[1]).toBe('G3 ↗');
    expect(links(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }))[1]).toBe('G15 ↗');
  });

  it('asks whether manual operation was intended on a mode exclusion', () => {
    const checks = nextChecks(row(END, { diagnosis: 'EXCLUDED_MODE', windowStart: START, gates: [cell('G1', 'EXCLUDED'), cell('G10', 'WARN')] }), opts);
    expect(checks.map(c => c.link)).toEqual(['Mode context ↗', 'Historical ↗', 'G10 proof ↗']);
    expect(checks[0].action).toEqual({ kind: 'mode' });
    expect(checks[2].action).toEqual({ kind: 'proof', gate: 'G10' });
  });

  it('offers the limit condition only when G10 spoke', () => {
    expect(links(row(END, { diagnosis: 'EXCLUDED_MODE', gates: [cell('G10', 'PASS')] }))).toEqual(['Mode context ↗', 'Historical ↗']);
  });

  it('carries the exact window into Historical', () => {
    const [, historical] = nextChecks(row(END, { diagnosis: 'EXCLUDED_MODE', windowStart: START }), opts);
    expect(historical.action.kind).toBe('link');
    const to = historical.action.kind === 'link' ? historical.action.to : '';
    const q = new URLSearchParams(to.split('?')[1]);
    expect(to.startsWith('/cpm/historical?')).toBe(true);
    expect([q.get('loop'), q.get('from'), q.get('to'), q.get('window'), q.get('kind')]).toEqual(['FIC10401', START, END, END, '12h']);
  });

  it('points another exclusion at the gate that excluded it, without asking about manual mode', () => {
    const checks = nextChecks(row(END, { diagnosis: 'EXCLUDED_OPERATING_REGION', gates: [cell('G2r', 'EXCLUDED')] }), opts);
    expect(checks[0].link).toBe('G2r proof ↗');
    expect(checks[0].action).toEqual({ kind: 'proof', gate: 'G2r' });
    expect(checks.map(c => c.label).join(' ')).not.toMatch(/manual/i);
  });

  it('sends a window short of data to where the samples and mapping are', () => {
    expect(links(row(END, { diagnosis: 'INSUFFICIENT_DATA' }))).toEqual(['Window Inspector ↗', 'Loop Registry ↗', 'Historical ↗']);
  });

  it('sends a window not evaluated to readiness and the engine', () => {
    expect(links(row(END, { diagnosis: 'NOT_EVALUATED' }))).toEqual(['Loop Explorer ↗', 'Pipeline Health ↗']);
  });

  it('offers a no-fault window the signals and earlier windows: the engine judged it', () => {
    expect(links(row(END, { diagnosis: 'NO_CALL' }))).toEqual(['Signals ↗', 'Compare windows ↗']);
  });

  it('never tells an insufficient-evidence window its data stopped: that is a verdict, not a gap', () => {
    const checks = nextChecks(row(END, { diagnosis: 'INSUFFICIENT_EVIDENCE' }), opts);
    expect(checks.map(c => c.link)).toEqual(['Signals ↗', 'Compare windows ↗']);
    expect(checks.map(c => c.label).join(' ')).not.toMatch(/data stopped|signal mapping|samples|still missing|engine is running/);
  });

  it('offers a healthy window the signals and earlier windows', () => {
    expect(links(row(END, { diagnosis: 'NORMAL' }))).toEqual(['Signals ↗', 'Compare windows ↗']);
  });

  it('uses ↗, never the old › ', () => {
    for (const d of ['CONFIRMED_OSCILLATION', 'EXCLUDED_MODE', 'INSUFFICIENT_DATA', 'INSUFFICIENT_EVIDENCE', 'NO_CALL', 'NOT_EVALUATED', 'NORMAL'])
      for (const link of links(row(END, { diagnosis: d }))) expect(link).toMatch(/ ↗$/);
  });
});
