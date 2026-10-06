// v2.5 workbench (audit F16): the explain column says what the gate asks, which method ran, why the
// result is what it is (sentences, ending with the next action), the parameters with labels and
// formatted values (raw key on hover), the configuration link and the identity with copy buttons;
// it collapses to a rail and remembers that.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ExplainPanel, useExplainCollapsed } from './ExplainPanel';
import type { EvidenceManifest, MethodRun } from '../../../api/cpm/evidence';
import type { GateState } from './GateResultState';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/accordion-item/accordion-item', () => ({
  // CHG-050: the explain / evidence sections are accordion items — title as a heading, a toggle, content when open.
  ObcAccordionItem: (p: { title: string; open?: boolean; children?: React.ReactNode; onAccordionItemToggle?: (e: { detail: { open: boolean } }) => void }) =>
    React.createElement('div', null,
      React.createElement('h2', null, p.title),
      React.createElement('button', { onClick: () => p.onAccordionItemToggle?.({ detail: { open: !p.open } }) }, `Toggle ${p.title}`),
      p.children),
}));
vi.mock('./ExplainWhy', () => ({ ExplainWhy: () => React.createElement('div', { 'data-testid': 'explain-why' }) }));
vi.mock('../config/EffectiveConfigDrawer', () => ({ EffectiveConfigDrawer: () => React.createElement('div', { 'data-testid': 'effective-config' }) }));
afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* stubbed below */ } });

const open = (title: string) => fireEvent.click(screen.getByRole('button', { name: `Toggle ${title}` }));

const run: MethodRun = {
  methodRunId: '4ccaf304-0e8d-54df-94ef-83f4130ee28d', tier: 'fusion', gate: 'G5', loopId: 'FIC10405', site: 'hdpe', windowKind: '24h', gateResultId: 1,
  support: { fromMs: 0, toMs: 1, sampleCount: 1 },
  identity: { bundleHash: 'profile:ffa30188e0775f18', contextRevision: 0, resultRevision: 1, purpose: 'LIVE', analysisRunId: null, sourceCommit: '3535c78aa45a', jarSha256: '4ea1da78ead8', datasetHash: '35fa0ee2b0abd44f', source: 'flink' },
  cell: { key: 'G5', name: 'Oscillation (ACF)', tier: 'long', status: 'WARN', reason: 'BANDWIDTH' }, verdictV2: null, result: null, methodRunIds: {},
  reconstruction: { supported: true, reason: '' }, computedAt: '2026-09-17T08:00:00Z',
};
const manifest = { artifacts: [{ gate: 'G5', kind: 'acf_series', provenance: { period_s: '290.23199999999997', regularity: '1.0', accepted_cycles: '33' } }] } as unknown as EvidenceManifest;
const entry = { gate: 'G5', name: 'Oscillation (ACF)', tier: 'long', role: 'PRIMARY', definition: 'Dominant period from the ACF.', preconditions: 'Enough cycles.', method: { id: 'G5.ACF_OSCILLATION', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: [], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null };
const ready: GateState = { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };

describe('ExplainPanel', () => {
  it('renders the six sections with formatted parameters (raw key on hover) and copyable identity', () => {
    render(<ExplainPanel gate="G5" run={run} entry={entry} manifest={manifest} state={ready} status="WARN" reason="BANDWIDTH" eligibilityDetail="3.4 samples per 17 s period < 4 (declared 5 s)" collapsed={false} onToggle={() => {}} />);
    const heads = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    // CHG-050: the reason first and open; the rest collapsed behind a one-line summary
    expect(heads).toEqual(['Why this result', 'What this gate asks', 'Method', 'Parameters used', 'Configuration', 'Identity']);
    expect(screen.getByTestId('explain-why')).toBeTruthy();   // CHG-055: the four-part explanation (own tests)
    expect(screen.queryByText('ACF period')).toBeNull();
    for (const t of ['What this gate asks', 'Method', 'Parameters used', 'Identity']) open(t);
    expect(screen.getByText('Dominant period from the ACF.')).toBeTruthy();
    expect(screen.getByText('Autocorrelation (oscillation) v3.0.0').getAttribute('title')).toBe('G5.ACF_OSCILLATION');
    expect(screen.getByText('ACF period').getAttribute('title')).toBe('acf_series.period_s');
    expect(screen.getByText('290.2 s')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy Run' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy Bundle' })).toBeTruthy();
    expect(screen.getByTitle('4ea1da78ead8')).toBeTruthy();
  });

  it('opens the configuration this run used on request', () => {
    render(<ExplainPanel gate="G5" run={run} entry={entry} manifest={manifest} state={ready} status="WARN" reason="BANDWIDTH" eligibilityDetail={null} collapsed={false} onToggle={() => {}} />);
    open('Configuration');
    fireEvent.click(screen.getByRole('button', { name: /Configuration this run used/ }));
    expect(screen.getByTestId('effective-config')).toBeTruthy();
  });

  it('collapses to a rail with a single "Show explain" control and calls onToggle', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ExplainPanel gate="G5" run={run} entry={entry} manifest={manifest} state={ready} status="WARN" reason={null} eligibilityDetail={null} collapsed={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide explain' }));
    expect(onToggle).toHaveBeenCalled();
    rerender(<ExplainPanel gate="G5" run={run} entry={entry} manifest={manifest} state={ready} status="WARN" reason={null} eligibilityDetail={null} collapsed={true} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Show explain' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });
});

describe('useExplainCollapsed', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  });
  it('defaults to expanded and remembers a collapse', () => {
    const { result } = renderHook(() => useExplainCollapsed());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(store['ams-evidence-explain-collapsed']).toBe('true');
    const again = renderHook(() => useExplainCollapsed());
    expect(again.result.current[0]).toBe(true);
  });
});
