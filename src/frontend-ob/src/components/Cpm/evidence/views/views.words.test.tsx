// CHG-193 (owner decision 15 Nov 2026, A2: "technical text should be removed"): the gate views name their charts, axes, legends,
// rows and table heads in words (PV / SP / OP / VP as the app writes them, "applied input", "Not mapped"); units stay, and the
// CSV keeps the column names it was exported under.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { decoded, times } from './fixtures';
import { G1Body, G2Body, G2rBody, G3Body, G4Body } from './ShortViews';
import { G6Body, G7Body, G9Body, G10Body, G11Body } from './LongViews';

const captured: unknown[] = [];
vi.mock('echarts-for-react', () => ({ default: (props: { option: unknown }) => { captured.push(props.option); return React.createElement('div', { 'data-testid': 'echarts' }); } }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(() => { cleanup(); captured.length = 0; });

type Option = { series: Array<{ name: string }>; xAxis?: { name?: string } | Array<{ name?: string }>; yAxis?: { name?: string } | Array<{ name?: string }> };
const names = (o: unknown) => {
  const opt = o as Option;
  const axes = (a: Option['xAxis']) => (Array.isArray(a) ? a : a ? [a] : []).map(x => x.name ?? '');
  return [...(opt.series ?? []).map(s => s.name ?? ''), ...axes(opt.xAxis)];
};
/** jsdom's Blob has no text(). */
const blobText = (b: Blob) => new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(b); });
const SNAKE = /\b[a-z]+_[a-z0-9_]+\b/;
const SHOUT = /\b[A-Z]{2,}(?:[ _][A-Z]{2,})+\b/;
/** No raw key or shouted code in the page text, the legends or the x axes. */
const plain = () => {
  const text = document.body.textContent ?? '';
  expect(text).not.toMatch(SNAKE);
  expect(text).not.toMatch(SHOUT);
  for (const o of captured) for (const n of names(o)) { expect(n).not.toMatch(SNAKE); expect(n).not.toMatch(SHOUT); }
};
const t = times(4);

describe('gate views in words', () => {
  it('G1: requested OP and applied input, the rows in words, the CSV columns unchanged', () => {
    const mode = decoded({ gate: 'G1', kind: 'mode_authority', x: t, y: [1, 1, 1, 1], columns: { op_requested: [40, 41, 42, 43], u_applied: [40, 41, 42, 43] } });
    render(<G1Body mode={mode} intervals={undefined} timeZone="UTC" fromMs={t[0]} toMs={t[3]} />);
    plain();
    expect(screen.getByText('Requested OP and applied input')).toBeTruthy();
    expect(screen.getByText('Controlling authority')).toBeTruthy();
    const series = (captured[0] as { series: Array<{ name: string }> }).series.map(s => s.name);
    expect(series).toEqual(['Requested OP', 'Applied input']);
  });

  it('G2 and G2r: the SP rate of change and the operating region in words', () => {
    render(<G2Body d={decoded({ gate: 'G2', kind: 'sp_events', x: t, y: [5, 5, 6, 6], columns: { pv: [5, 5, 6, 6], d_sp_dt: [0, 0, 0.2, 0], event_id: [0, 0, 1, 0] } })} timeZone="UTC" />);
    plain();
    expect(screen.getByText('SP rate of change')).toBeTruthy();
    expect(screen.getByText('Event type')).toBeTruthy();
    cleanup(); captured.length = 0;
    render(<G2rBody d={decoded({ gate: 'G2r', kind: 'operating_region', x: t, y: [50, 51, 52, 53], mask: [true, false, true, true], columns: { u_applied: [40, 41, 42, 43] } })}
      timeZone="UTC" fromMs={t[0]} toMs={t[3]} />);
    plain();
    expect(names(captured[0])).toContain('Applied input (pp)');
    expect(screen.getByText('Region bounds')).toBeTruthy();
  });

  it('G3 and G4: the integrals and the control activity in words', () => {
    render(<G3Body d={decoded({ gate: 'G3', kind: 'objective_error', x: t, y: [0, 1, 0, 1], columns: { cumulative_iae: [0, 1, 1, 2], cumulative_ise: [0, 1, 1, 2], cumulative_itae: [0, 1, 1, 2] } })} timeZone="UTC" />);
    plain();
    expect(screen.getByText('Cumulative IAE')).toBeTruthy();
    expect(screen.getByText('Benchmark interval')).toBeTruthy();
    cleanup(); captured.length = 0;
    render(<G4Body d={decoded({ gate: 'G4', kind: 'control_activity', x: t, y: [40, 41, 40, 41], yUnit: 'pp', mask: [false, true, true, false], columns: { vp: [40, 41, 40, 41], delta_u: [0, 1, -1, 1] } })} timeZone="UTC" />);
    plain();
    expect(screen.getByText('Applied input and VP (pp) with reversals')).toBeTruthy();
    expect(screen.getByText('Measured travel')).toBeTruthy();
  });

  it('G6, G7 and G9: the spectrum axis, the per-cycle table heads and the geometry axes in words', () => {
    render(<G6Body d={decoded({ gate: 'G6', kind: 'psd', x: [0.01, 0.02, 0.03], y: [1, 5, 1], xQuantity: 'frequency', xUnit: 'Hz', mask: [false, true, false], provenance: { noise_reference: '0.5' } })} />);
    plain();
    expect(names(captured[0])).toContain('Frequency (Hz)');
    cleanup(); captured.length = 0;
    const cycle = decoded({ gate: 'G7', kind: 'cycle_fit', role: 'CYCLE_1', x: [0, 0.5, 1], y: [0, 0, 0], xQuantity: 'phase', xUnit: 'cycle_fraction',
      columns: { sine_fit: [0, 0, 0], triangle_fit: [0, 0, 0] },
      provenance: { cycle_id: '1', accepted: 'false', reject_reason: 'FLAT_CYCLE', sse_sine: '0', sse_triangle: '0', cycle_score: '0', amplitudes: '0', phases: '0' } });
    render(<G7Body cycles={[cycle]} />);
    plain();
    expect(Array.from(document.querySelectorAll('th')).map(h => h.textContent))
      .toEqual(['Cycle', 'Accepted', 'Sine fit error', 'Triangle fit error', 'Cycle score', 'Amplitude', 'Phase (rad)', 'Reject reason']);
    expect(screen.getByText('Flat cycle')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
    cleanup(); captured.length = 0;
    const poly = decoded({ gate: 'G9', kind: 'cycle_polygon', role: 'CYCLE_0', x: [1, 2, 3], y: [40, 41, 42], columns: { corners: [0, 1, 0] }, provenance: { cycle_id: '0', area: '0.2', bbox_area: '0.5' } });
    render(<G9Body polygons={[poly]} pairs={[]} corners={undefined} timeZone="UTC" />);
    plain();
    expect(names(captured[0]).some(n => n.startsWith('Applied input ('))).toBe(true);
    expect(Array.from(document.querySelectorAll('th')).map(h => h.textContent)).toEqual(['Cycle', 'Area', 'Bounding-box area', 'Points scored']);
  });

  it('G10 and G11: requested and applied input, tracking error, pressures Not mapped, the change in PV', () => {
    const lim = decoded({ gate: 'G10', kind: 'actuator_limits', x: t, y: [99, 100, 100, 50], yUnit: 'pp',
      columns: { u_requested: [99, 100, 100, 50], vp: [99, 99, 99, 50], tracking_error: [0, 1, 1, 0], active_low: [0, 0, 0, 0], active_high: [0, 1, 1, 0] } });
    const dwell = decoded({ gate: 'G10', kind: 'DWELL_EVENTS', x: [t[1]], y: [10], xQuantity: 'start_time', yQuantity: 'duration', yUnit: 's', mask: [true] });
    render(<G10Body d={lim} dwell={dwell} timeZone="UTC" />);
    plain();
    expect(screen.getByText('Requested and applied input and VP (pp)')).toBeTruthy();
    expect(screen.getByText('Tracking error (requested input − VP)')).toBeTruthy();
    expect(screen.getByText('Supply / actuator pressure').nextSibling?.textContent).toMatch(/^Not mapped \/ Not mapped/);
    expect(screen.getByText('High dwell')).toBeTruthy();
    cleanup(); captured.length = 0;
    const m = decoded({ gate: 'G11', kind: 'measurement', x: t, y: [1, 1, 1, 1], columns: { delta_pv: [NaN, 0, 0, 0], spikes: [0, 0, 1, 0] }, units: { delta_pv: 'EU' }, provenance: { noise_band: '0.02' } });
    render(<G11Body d={m} freeze={undefined} health={undefined} timeZone="UTC" />);
    plain();
    expect(screen.getByText('Change in PV per sample, with the noise band; spikes marked')).toBeTruthy();
  });

  it('keeps the CSV column names the views exported before', async () => {
    const lim = decoded({ gate: 'G10', kind: 'actuator_limits', x: t, y: [99, 100, 100, 50], yUnit: 'pp',
      columns: { u_requested: [99, 100, 100, 50], vp: [99, 99, 99, 50], tracking_error: [0, 1, 1, 0] } });
    render(<G10Body d={lim} dwell={undefined} timeZone="UTC" />);
    expect((captured[0] as { series: Array<{ name: string }> }).series.map(s => s.name)).toEqual(['Requested input', 'Applied input', 'VP']);
    const blobs: Blob[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: (b: Blob) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL: () => undefined }));
    try {
      fireEvent.click(screen.getAllByText('Export CSV')[0]);
      const header = (await blobText(blobs[0])).split('\n').find(l => !l.startsWith('#'));
      expect(header).toBe('time_utc,time_site,u_requested (pp),u_applied (pp),vp (pp)');
    } finally { vi.unstubAllGlobals(); click.mockRestore(); }
  });
});
