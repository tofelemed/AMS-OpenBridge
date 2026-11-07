// CHG-153: the Workbench's Back and Replay links name the run's own window and kind, never the newest or a 12h stand-in.
import { describe, expect, it } from 'vitest';
import { backLink, replayLink } from './runLinks';

const OLD_MS = Date.parse('2026-11-04T08:00:00Z');

describe('backLink', () => {
  it('a fused run that is not among the loaded windows still carries its own end', () => {
    const l = backLink({ loopId: 'L1', gate: 'G3', kind: '24h', toMs: OLD_MS, listedEnd: null });
    expect(l.label).toBe('Back to Investigation ↗');
    expect(l.href).toContain('window=2026-11-04T08%3A00%3A00.000Z');
    expect(l.href).toContain('profile=24h');
  });

  it('a 15m run goes to the Window Inspector on its own kind and end, never to a 12h Investigation', () => {
    const l = backLink({ loopId: 'L1', gate: 'G3', kind: '15m', toMs: OLD_MS });
    expect(l.label).toBe('Back to Window Inspector ↗');
    expect(l.href.startsWith('/cpm/windows')).toBe(true);
    expect(l.href).toContain('profile=15m');
    expect(l.href).toContain('window=2026-11-04T08%3A00%3A00.000Z');
  });
});

describe('backLink for a response (G12) run', () => {
  it('goes back to System Response for that run, never to a window kind that does not exist', () => {
    const l = backLink({ loopId: 'L1', gate: 'G12', kind: 'event', toMs: OLD_MS, methodRunId: 'ev-1' });
    expect(l.label).toBe('Back to System Response ↗');
    expect(l.href.startsWith('/cpm/response')).toBe(true);
    expect(l.href).toContain('methodRun=ev-1');
    expect(l.href).not.toContain('profile=event');
  });
  it('every kind a run can carry maps to a page that exists', () => {
    const page = (kind: string) => backLink({ loopId: 'L1', gate: 'G3', kind, toMs: OLD_MS, methodRunId: 'r' }).href.split('?')[0];
    for (const k of ['1m', '5m', '15m', '4h']) expect(page(k)).toBe('/cpm/windows');
    for (const k of ['12h', '24h']) expect(page(k)).toBe('/cpm/investigation');
    expect(page('event')).toBe('/cpm/response');
  });
});

describe('replayLink', () => {
  it('is offered for 12h and 24h', () => {
    const l = replayLink({ loopId: 'L1', gate: 'G3', kind: '12h', toMs: OLD_MS });
    expect(l.href).toContain('kind=12h');
  });
  it('is not offered for 15m or 4h, and says why', () => {
    for (const kind of ['15m', '4h']) {
      expect(replayLink({ loopId: 'L1', gate: 'G3', kind, toMs: OLD_MS })).toEqual({ href: null, reason: 'Replay holds 12 h and 24 h windows' });
    }
  });
});
