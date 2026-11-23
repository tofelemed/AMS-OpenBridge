// 2026-09-18 Gate Configuration redesign: the effective configuration is READ, not dumped - the layer
// stack says where values come from, the gate dropdown counts the overrides, one gate's table shows at
// a time, a search crosses gates, the workers fold to one line. CHG-184: no hash or jar.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EffectiveView, partName } from './EffectiveView';
import type { CatalogueEntry, EffectiveConfig } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const eff: EffectiveConfig = {
  loopId: 'TIC10101', site: 'hdpe', profileId: 'TEMP_SLOW_SELF_REG', state: 'ACTIVE_VERIFIED',
  bundle: { bundleId: 'b2', version: 2, contentHash: 'f9153b00aaf3ba1a3b19', scopeKind: 'LOOP', scopeRef: 'TIC10101', changeClass: 'POLICY', effectiveFrom: '2026-09-17T06:36:16Z', catalogueHash: '8bbcbbbb7da0' },
  properties: { 'G0.mode': 'OPERATIONAL', 'G0.coverage_min': 0.95, 'G0.min_samples': 10, 'G4.activity_warn_ratio': 4.5, 'G4.activity_alarm_ratio': 9, 'G12.noise_multiplier': 4 },
  sources: { 'G0.mode': 'FACTORY', 'G0.coverage_min': 'PROFILE', 'G0.min_samples': 'FACTORY', 'G4.activity_warn_ratio': 'LOOP', 'G4.activity_alarm_ratio': 'FACTORY', 'G12.noise_multiplier': 'FACTORY' },
  workers: [
    { jobName: 'AMS - CPLM Short Feature Engine', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb7da0', ack: { status: 'ACK', bundleHash: 'f9153b00aaf3ba1a3b19', jarSha256: '4ea1da78aaaa', receivedAt: 't' } },
    { jobName: 'AMS - CPLM Gate Fusion Engine', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb7da0', ack: { status: 'ACK', bundleHash: 'f9153b00aaf3ba1a3b19', jarSha256: '4ea1da78aaaa', receivedAt: 't' } },
  ],
};

vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
const cat = new Map<string, CatalogueEntry>([['G0.coverage_min', { property: 'G0.coverage_min', id: 'CFG-002', gate: 'G0', type: 'number', unit: 'fraction', effect: 'Share of samples a window needs', default: 0.9, validation: {}, dependencies: [], consumers: [], changeClass: 'POLICY', commissioningRequired: false, notReadByBuild: null } as unknown as CatalogueEntry]]);

const gateOptions = () => [...(screen.getByRole('combobox', { name: 'Gate' }) as HTMLSelectElement).options].map(o => o.textContent);

describe('EffectiveView', () => {
  it('draws the layer stack, badges the gates, shows one gate at a time and folds the workers', () => {
    render(<EffectiveView eff={eff} />);
    const stack = screen.getByRole('list', { name: 'Layers' });
    expect(within(stack).getAllByRole('listitem').map(li => li.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/Factory.*4/), expect.stringMatching(/Type settings.*TEMP_SLOW_SELF_REG.*1/), expect.stringMatching(/Own settings.*TIC10101.*1/)]));
    const strip = screen.getByRole('combobox', { name: 'Gate' }) as HTMLSelectElement;
    expect(gateOptions()).toEqual(['G0 · 1 set above factory', 'G4 · 1 set above factory', 'G12']);
    expect(strip.value).toBe('G0');
    const rows = within(screen.getByRole('table', { name: 'Effective properties' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);                                                                            // G0's three properties only
    expect(rows[0].textContent).toMatch(/Coverage minimum.*0\.95.*Loop type/);   // alphabetical within the gate
    const box = screen.getByText('Where it runs').closest('details')!;
    expect(box.hasAttribute('open')).toBe(false);
    expect(box.querySelector('summary')!.textContent).toBe('Where it runs');
    expect(screen.queryByText(/applied · one jar|workers on one jar/)).toBeNull();
    expect(within(box).getByRole('table')).toBeTruthy();
  });

  it('choosing a gate switches the table; the search crosses gates and filters the list', () => {
    render(<EffectiveView eff={eff} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Gate' }), { target: { value: 'G4' } });
    const propRows = () => within(screen.getByRole('table', { name: 'Effective properties' })).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(propRows()).toEqual([expect.stringMatching(/Activity alarm ratio/), expect.stringMatching(/Activity warn ratio/)]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a setting' }), { target: { value: 'noise' } });
    expect(propRows()).toEqual([expect.stringMatching(/Noise multiplier/)]);
    expect(gateOptions()).toEqual(['All matching gates', 'G12']);   // the rows span gates, so the list says so
  });

  it('names each worker and what it applied, with no jar, catalogue or bundle hash (CHG-184)', () => {
    render(<EffectiveView eff={eff} />);
    const box = screen.getByText('Where it runs').closest('details')!;
    expect(within(box).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Part', 'applied']);
    expect(box.textContent).toContain('Ready');
    expect(box.textContent).toContain('Version');
    expect(box.textContent).toContain('Own settings v2 · Running');
    expect(box.textContent).not.toMatch(/ACK|APPLY|bundle|POLICY|effective/i);
    expect(box.textContent).not.toMatch(/f9153b00|4ea1da78|8bbcbbbb/);
  });

  it('a part that did not confirm reads Not confirmed yet; no ACK, NACK or observer words', () => {
    const w = eff.workers;
    render(<EffectiveView eff={{ ...eff, workers: [{ ...w[0], ack: { ...w[0].ack!, status: 'NACK' } }, { ...w[1], ack: null }, { ...w[1], jobName: 'Context', required: false }] as never }} />);
    const box = screen.getByText('Where it runs').closest('details')!;
    expect(box.textContent).toMatch(/Refused/);
    expect(box.textContent).toMatch(/Not confirmed yet/);
    expect(box.textContent).toMatch(/Reads no setting/);
    expect(box.textContent).not.toMatch(/ACK|observer|reads no property|another bundle/);
  });

  it('the factory layer reads as such', () => {
    render(<EffectiveView eff={{ ...eff, state: 'NO_ACTIVE_BUNDLE', bundle: null, note: 'no governed bundle is active for this loop: the engine runs the factory layer', sources: Object.fromEntries(Object.keys(eff.properties).map(k => [k, 'FACTORY'])), workers: eff.workers.map(w => ({ ...w, ack: undefined })) }} />);
    expect(screen.queryByText(/no governed bundle is active/)).toBeNull();   // the page header's Runs under says it
    expect(gateOptions()).toEqual(['G0', 'G4', 'G12']);
    expect(screen.queryByText(/nothing to acknowledge/)).toBeNull();
    expect(screen.getByText('Where it runs')).toBeTruthy();
    expect(screen.getAllByText('Factory settings').length).toBeGreaterThan(0);
  });

  it('shows Setting, Value and From in plain words, the code only in the title', () => {
    render(<EffectiveView eff={eff} catalogue={cat} />);
    expect(screen.getByText('Where each value comes from')).toBeTruthy();
    expect(screen.queryByText('Layer stack')).toBeNull();
    const table = screen.getByRole('table', { name: 'Effective properties' });
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Setting', 'Value', 'From']);
    const row = within(table).getAllByRole('row')[1];
    expect(row.textContent).toMatch(/Coverage minimum.*POLICY.*0\.95.*Loop type/);   // class sits under the name
    expect(within(table).getByRole('button', { name: 'Coverage minimum' }).getAttribute('title')).toBe('G0.coverage_min');
    expect(table.textContent).not.toMatch(/G0\.|unset|FACTORY|PROFILE/);
    expect(row.textContent).not.toMatch(/CFG-002|fraction/);                          // the unit is in the dialog
  });

  it('a missing value is a dash and its source says it is worked out, not unset', () => {
    render(<EffectiveView eff={{ ...eff, properties: { ...eff.properties, 'G0.coverage_min': null }, sources: { ...eff.sources, 'G0.coverage_min': 'NO_VALUE' } }} />);
    const row = screen.getByRole('button', { name: 'Coverage minimum' }).closest('tr')!;
    expect(row.textContent).toMatch(/—.*Worked out automatically/);
    expect(document.body.textContent).not.toMatch(/unset|NO_VALUE/);
  });

  it('opens a property in a dialog', () => {
    render(<EffectiveView eff={eff} catalogue={cat} />);
    fireEvent.click(screen.getByRole('button', { name: /Coverage minimum/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('CFG-002')).toBeNull();   // CHG-184: no catalogue id
    expect(within(dialog).getByText('fraction')).toBeTruthy();
    expect(within(dialog).getByText(/Share of samples a window needs/)).toBeTruthy();
    expect(within(dialog).getByText('Loop type')).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/unset|FACTORY|PROFILE/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says so in one line when the catalogue is not loaded', () => {
    render(<EffectiveView eff={eff} />);
    fireEvent.click(screen.getByRole('button', { name: /Coverage minimum/ }));
    expect(within(screen.getByRole('dialog')).getByText(/catalogue is not loaded/i)).toBeTruthy();
  });
});

describe('partName', () => {
  it('names the engines by what they do and strips the prefixes from any other', () => {
    expect(partName('AMS - CPLM Short Feature Engine')).toBe('Short checks');
    expect(partName('AMS - CPLM Long Feature Engine')).toBe('Long checks');
    expect(partName('AMS - CPLM Gate Fusion Engine')).toBe('Verdicts');
    expect(partName('AMS - CPLM Response Engine')).toBe('System response');
    expect(partName('AMS - CPLM Drift Monitor')).toBe('Drift Monitor');
  });
});
