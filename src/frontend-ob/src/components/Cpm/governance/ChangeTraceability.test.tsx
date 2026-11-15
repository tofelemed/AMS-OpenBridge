// @vitest-environment jsdom
// CHG-174 (owner review, badges 12-13, answer 1): the three version rows; a failed read says so with Retry (it showed "v— · —");
// Registered loops went (the top bar shows it).
// CHG-202 (owner, 15 Nov 2026): no engine class, service build, commit or jar; Build details went.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChangeTraceability } from './ChangeTraceability';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));

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
    expect(value('Calculations')).toBe('v3.0.0');
    expect(value('Dynamics profile')).toBe('v2.0.0');
    expect(value('Threshold profiles in use')).toBe('defaults only');
    expect(screen.queryByText('Registered loops')).toBeNull();
    expect(screen.queryByText('Service build')).toBeNull();
  });

  it('shows no engine name, build, commit or jar, and has no Build details (CHG-202)', () => {
    render(<ChangeTraceability />);
    expect(screen.queryByText('Build details')).toBeNull();
    expect(screen.queryByText('Calculation engine')).toBeNull();
    expect(document.body.textContent).not.toMatch(/CplmGateFusionEngine|Flink|2f5ff876|4e1a9c07|9b2f61c0|commit|jar/);
  });

  it('a failed versions read says so with Retry, and never shows "v—"', () => {
    calc = { isError: true, error: new Error('The service is currently unavailable. Try again shortly.'), refetch: vi.fn() };
    render(<ChangeTraceability />);
    expect(screen.getByText('Calculation versions could not be read')).toBeTruthy();
    expect(screen.queryByText(/v—/)).toBeNull();
    fireEvent.click(screen.getByText('Retry'));
    expect(calc.refetch).toHaveBeenCalled();
  });

  it('names the threshold profiles in use, and claims none while the loops are not read', () => {
    loops = { data: { loops: [{ thresholdProfileId: 'tight' }, { thresholdProfileId: 'loose' }, { thresholdProfileId: 'tight' }], count: 3 }, refetch: vi.fn() };
    render(<ChangeTraceability />);
    expect(value('Threshold profiles in use')).toBe('tight, loose');
    cleanup();
    loops = { data: { loops: [{ thresholdProfileId: 'pid_flow' }], count: 1 }, refetch: vi.fn() };
    render(<ChangeTraceability />);
    expect(value('Threshold profiles in use')).toBe('PID flow');
    cleanup();
    loops = { isError: true, error: new Error('x'), refetch: vi.fn() };
    render(<ChangeTraceability />);
    expect(value('Threshold profiles in use')).toBe('—');
  });
});
