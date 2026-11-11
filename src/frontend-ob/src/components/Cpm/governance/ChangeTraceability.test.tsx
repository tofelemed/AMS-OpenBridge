// @vitest-environment jsdom
// CHG-174 (owner review, badges 12-13, answer 1): the three version rows; the builds in a Build details dialog; a failed read
// says so with Retry (it showed "v— · —"); Registered loops went (the top bar shows it).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ChangeTraceability } from './ChangeTraceability';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));

type Q = { data?: unknown; isLoading?: boolean; isError?: boolean; error?: unknown; refetch: () => void };
let calc: Q; let caps: Q; let loops: Q;
vi.mock('../../../hooks/useCpm', () => ({ useCpmCalculations: () => calc, useCpmCapabilities: () => caps, useCpmLoops: () => loops }));

const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

beforeEach(() => {
  calc = { data: { calculationVersion: '3.0.0', dynamicsProfileVersion: '2.0.0', engine: 'CplmGateFusionEngine (Flink)' }, refetch: vi.fn() };
  caps = {
    data: {
      service: { version: '1.0.0', sourceCommit: '2f5ff876aaaabbbbccccddddeeeeffff00001111' },
      engine: { observed: [{ calculationVersion: '3.0.0', sourceCommit: '4e1a9c07b2d3aaaabbbbccccddddeeeeffff0000-dirty', jarSha256: '9b2f61c0a7e4'.padEnd(64, '0') }] },
    },
    refetch: vi.fn(),
  };
  loops = { data: { loops: [{ loopId: 'A', thresholdProfileId: null }], count: 243 }, refetch: vi.fn() };
});
afterEach(cleanup);

describe('change traceability', () => {
  it('shows the versions producing today’s verdicts, and nothing the top bar already says', () => {
    render(<ChangeTraceability />);
    expect(value('Calculation engine')).toBe('v3.0.0 · CplmGateFusionEngine (Flink)');
    expect(value('Dynamics profile')).toBe('v2.0.0');
    expect(value('Threshold profiles in use')).toBe('defaults only');
    expect(screen.queryByText('Registered loops')).toBeNull();
    expect(screen.queryByText('cplm-api build')).toBeNull();
  });

  it('Build details hold the service build and the engine builds, the commit cut to 12 characters', () => {
    render(<ChangeTraceability />);
    fireEvent.click(screen.getByText('Build details'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('cplm-api build').nextElementSibling?.textContent).toBe('1.0.0 · 2f5ff876aaaa');
    expect(within(dialog).getByText('Engine build 1').nextElementSibling?.textContent).toBe('calc 3.0.0 · commit 4e1a9c07b2d3-dirty · jar 9b2f61c0a7e4');
    expect(within(dialog).getAllByRole('heading').map(h => h.textContent)).toEqual(['Build details', 'Service', 'Engine builds observed']);
  });

  it('a failed versions read says so with Retry, and never shows "v—"', () => {
    calc = { isError: true, error: new Error('The service is currently unavailable. Try again shortly.'), refetch: vi.fn() };
    render(<ChangeTraceability />);
    expect(screen.getByText('Calculation versions could not be read')).toBeTruthy();
    expect(screen.queryByText(/v—/)).toBeNull();
    fireEvent.click(screen.getByText('Retry'));
    expect(calc.refetch).toHaveBeenCalled();
  });

  it('a failed build read says so in Build details with Retry', () => {
    caps = { isError: true, error: new Error('The service is currently unavailable. Try again shortly.'), refetch: vi.fn() };
    render(<ChangeTraceability />);
    fireEvent.click(screen.getByText('Build details'));
    expect(within(screen.getByRole('dialog')).getByText('Build details could not be read')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Retry'));
    expect(caps.refetch).toHaveBeenCalled();
  });

  it('names the threshold profiles in use, and claims none while the loops are not read', () => {
    loops = { data: { loops: [{ thresholdProfileId: 'tight' }, { thresholdProfileId: 'loose' }, { thresholdProfileId: 'tight' }], count: 3 }, refetch: vi.fn() };
    render(<ChangeTraceability />);
    expect(value('Threshold profiles in use')).toBe('tight, loose');
    cleanup();
    loops = { isError: true, error: new Error('x'), refetch: vi.fn() };
    render(<ChangeTraceability />);
    expect(value('Threshold profiles in use')).toBe('—');
  });
});
