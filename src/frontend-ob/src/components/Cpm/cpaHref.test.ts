// docs/cpa-ui-fix-plan.md §2 — the URL is the only selection state, so the
// builders are the contract every in-page route follows.
import { describe, it, expect } from 'vitest';
import {
  calculationsHref, eventsHref, evidenceHref, explorerHref, performanceHref, pipelineHref, replayHref,
  responseHref, windowsHref,
} from './cpaHref';

describe('cpaHref', () => {
  it('explorerHref always carries the loop and encodes it', () => {
    expect(explorerHref('FIC10301')).toBe('/cpm/explorer?loop=FIC10301');
    expect(explorerHref('45FIC-109/A', { tab: 'Summary', gate: 'G9' }))
      .toBe('/cpm/explorer?loop=45FIC-109%2FA&tab=Summary&gate=G9');
  });

  it('performanceHref writes the kind under ?window= (what Performance reads) and drops empties', () => {
    expect(performanceHref()).toBe('/cpm/performance');
    expect(performanceHref({ loop: 'FIC10301', gate: 'G15', kind: '24h' }))
      .toBe('/cpm/performance?loop=FIC10301&gate=G15&window=24h');
    expect(performanceHref({ rows: 'attention', loop: null, gate: '' }))
      .toBe('/cpm/performance?rows=attention');
  });

  it('eventsHref carries the episode id and the loop', () => {
    expect(eventsHref({ event: 833, loop: 'FIC10301' })).toBe('/cpm/events?loop=FIC10301&event=833');
    expect(eventsHref({ loop: undefined })).toBe('/cpm/events');
  });

  it('replayHref passes the evaluated window END as ?window= (what Replay reads) plus gate and kind', () => {
    expect(replayHref('FIC10301', { gate: 'G9', window: '2026-09-18T14:15:00Z', kind: '24h' }))
      .toBe('/cpm/replay?loop=FIC10301&gate=G9&window=2026-09-18T14%3A15%3A00Z&kind=24h');
    expect(replayHref('FIC10301', { gate: 'G9', window: null })).toBe('/cpm/replay?loop=FIC10301&gate=G9');
  });

  it('windowsHref writes the kind as ?profile= (what the Inspector reads)', () => {
    expect(windowsHref('FIC10301', { profile: '15m' })).toBe('/cpm/windows?loop=FIC10301&profile=15m');
    expect(pipelineHref()).toBe('/cpm/pipeline');
  });

  it('evidence, response and calculations carry the loop (and only known extras)', () => {
    expect(evidenceHref('FIC10301', { kind: '24h' })).toBe('/cpm/evidence?loop=FIC10301&kind=24h');
    expect(responseHref('FIC10301')).toBe('/cpm/response?loop=FIC10301');
    expect(responseHref('FIC10301', { event: 'ca1d45b1' })).toBe('/cpm/response?loop=FIC10301&event=ca1d45b1');
    expect(calculationsHref('FIC10301')).toBe('/cpm/calculations?loop=FIC10301');
  });
});
