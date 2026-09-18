// 2026-09-18 Gate Configuration redesign: the effective configuration is READ, not dumped - the layer
// stack says where values come from, the gate strip carries override badges, one gate's table shows at
// a time, a search crosses gates, the workers fold to one line; a run's bundle mismatch is still an alert.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EffectiveView } from './EffectiveView';
import type { EffectiveConfig } from '../../../api/cpm/config';

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

describe('EffectiveView', () => {
  it('draws the layer stack, badges the gates, shows one gate at a time and folds the workers', () => {
    render(<EffectiveView eff={eff} />);
    const stack = screen.getByRole('list', { name: 'Layers' });
    expect(within(stack).getAllByRole('listitem').map(li => li.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/FACTORY.*4/), expect.stringMatching(/PROFILE.*TEMP_SLOW_SELF_REG.*1/), expect.stringMatching(/LOOP.*TIC10101.*1/)]));
    const strip = screen.getByRole('tablist', { name: 'Gate' });
    expect(within(strip).getAllByRole('tab').map(t => t.textContent)).toEqual(['G0 1', 'G4 1', 'G12']);      // badge = overridden above FACTORY
    expect(within(strip).getByRole('tab', { name: /G0/ }).getAttribute('aria-selected')).toBe('true');
    const rows = within(screen.getByRole('table', { name: 'Effective properties' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);                                                                            // G0's three properties only
    expect(rows[0].textContent).toMatch(/G0\.coverage_min.*0\.95.*PROFILE/);   // alphabetical within the gate
    expect(screen.getByText(/2 of 2 applied · one jar 4ea1da78 · catalogue matches/)).toBeTruthy();
    expect(screen.getByText('APPLY acknowledgements').closest('details')!.hasAttribute('open')).toBe(false);
  });

  it('a gate click switches the table; the search crosses gates and filters the strip', () => {
    render(<EffectiveView eff={eff} />);
    fireEvent.click(screen.getByRole('tab', { name: /G4/ }));
    const propRows = () => within(screen.getByRole('table', { name: 'Effective properties' })).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(propRows()).toEqual([expect.stringMatching(/G4\.activity_alarm_ratio/), expect.stringMatching(/G4\.activity_warn_ratio/)]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a property' }), { target: { value: 'noise' } });
    expect(propRows()).toEqual([expect.stringMatching(/G12\.noise_multiplier/)]);
    expect(within(screen.getByRole('tablist', { name: 'Gate' })).getAllByRole('tab').map(t => t.textContent)).toEqual(['G12']);
  });

  it('a run computed under another bundle is said as an alert; the same bundle as a note', () => {
    render(<EffectiveView eff={eff} runBundleHash="deadbeefdeadbeef" />);
    expect(screen.getByRole('alert').textContent).toMatch(/NOT the configuration active for this loop today/);
    cleanup();
    render(<EffectiveView eff={eff} runBundleHash="f9153b00aaf3ba1a3b19" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/computed under this configuration/)).toBeTruthy();
  });

  it('the factory layer reads as such', () => {
    render(<EffectiveView eff={{ ...eff, state: 'NO_ACTIVE_BUNDLE', bundle: null, note: 'no governed bundle is active for this loop: the engine runs the factory layer', sources: Object.fromEntries(Object.keys(eff.properties).map(k => [k, 'FACTORY'])), workers: eff.workers.map(w => ({ ...w, ack: undefined })) }} />);
    expect(screen.getByText(/no governed bundle is active/)).toBeTruthy();
    expect(within(screen.getByRole('tablist', { name: 'Gate' })).getAllByRole('tab').map(t => t.textContent)).toEqual(['G0', 'G4', 'G12']);
    expect(screen.getByText(/factory layer \(nothing to acknowledge\)/)).toBeTruthy();
  });
});
