// docs/cpa-ui-fix-plan.md §2 — the URL is the only selection state, so the
// builders are the contract every in-page route follows.
import { describe, it, expect } from 'vitest';
import {
  calculationsHref, eventsHref, evidenceHref, explorerHref, historicalHref, investigationHref, performanceHref, pipelineHref, replayHref,
  responseHref, windowsHref,
} from './cpaHref';

describe('cpaHref', () => {
  it('investigationHref writes the fused kind under ?profile= (what Investigation reads)', () => {
    expect(investigationHref('FIC 1', { kind: '24h' })).toBe('/cpm/investigation?loop=FIC+1&profile=24h');
    expect(investigationHref('L1')).toBe('/cpm/investigation?loop=L1');
  });

  it('historicalHref carries the loop', () => {
    expect(historicalHref('B2_027PIC')).toBe('/cpm/historical?loop=B2_027PIC');
  });

  it('explorerHref always carries the loop and encodes it', () => {
    expect(explorerHref('FIC10301')).toBe('/cpm/explorer?loop=FIC10301');
    expect(explorerHref('45FIC-109/A', { tab: 'Summary', gate: 'G9' }))
      .toBe('/cpm/explorer?loop=45FIC-109%2FA&tab=Summary&gate=G9');
  });

  it('explorerHref writes the fused kind under ?window= (what the Summary gate strip reads)', () => {
    expect(explorerHref('FIC10301', { kind: '12h' })).toBe('/cpm/explorer?loop=FIC10301&window=12h');
    expect(explorerHref('FIC10301', { kind: null })).toBe('/cpm/explorer?loop=FIC10301');
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

describe('KPI proof opens the exact metric on the exact window (CHG-092, SME review 2 #9)', () => {
  it('carries the window kind and the CPLM id', () => {
    expect(calculationsHref('FIC10301', { kind: '24h', metric: 'CPLM-014' }))
      .toBe('/cpm/calculations?loop=FIC10301&window=24h&metric=CPLM-014');
    expect(calculationsHref('FIC10301', { kind: null, metric: undefined })).toBe('/cpm/calculations?loop=FIC10301');
  });
});

describe('a KPI or a finding opens its own window on the trend (CHG-097, SME review 2 #26)', () => {
  it('carries the window kind, the window to shade, the signals and what was clicked', () => {
    expect(historicalHref('FIC1', { from: 'a', to: 'b', kind: '24h', window: 'b', signals: 'op,vp', focus: 'Time at an OP limit' }))
      .toBe('/cpm/historical?loop=FIC1&from=a&to=b&kind=24h&window=b&signals=op%2Cvp&focus=Time+at+an+OP+limit');
  });
});
