// @vitest-environment jsdom
/** Signals: signal, value, unit and Show in trend, the UNS path as a second line, and a foot with quality and links. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';

const nav = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async orig => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => nav }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmReadiness: () => ({ data: { checks: [{ id: 'binding_provenance', ok: true }] }, isError: false }),
}));
vi.mock('./summary/useSignalValues', () => ({
  useSignalValues: () => ({
    signals: [
      { role: 'PV', value: '12.35', unit: '', note: '' },
      { role: 'SP', value: '12.00', unit: '', note: '' },
      { role: 'OP', value: '48.20', unit: '%', note: '' },
    ],
    mode: { label: 'AUTO' },
    quality: { tone: 'good', text: 'Good' },
  }),
}));

import { SignalsTab } from './SignalsTab';

afterEach(() => { cleanup(); nav.mockReset(); });

const LOOP = {
  loopId: 'FIC00701', tags: { PV: 'root.a.pv', SP: 'root.a.sp', OP: 'root.a.op', MODE: 'root.a.mode', UTILITY: 'root.a.util' },
} as unknown as CpmLoop;
const tab = () => render(<MemoryRouter><SignalsTab loop={LOOP} /></MemoryRouter>);

describe('SignalsTab', () => {
  it('shows signal, value, unit and Show in trend, with the UNS path as a second line', () => {
    tab();
    const pv = screen.getByRole('row', { name: /PV/ });
    expect(within(pv).getByText('12.35')).toBeTruthy();
    expect(within(pv).getByText('root.a.pv')).toBeTruthy();
    expect(within(pv).getByRole('button', { name: 'Show in trend ↗' })).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /OP/ })).getByText('%')).toBeTruthy();
    // a role the engine has no live value for is a dash, never 0
    expect(within(screen.getByRole('row', { name: /UTILITY/ })).getByText('—')).toBeTruthy();
  });

  it('sends Show in trend to a trend of that signal only', () => {
    tab();
    fireEvent.click(within(screen.getByRole('row', { name: /SP/ })).getByRole('button', { name: 'Show in trend ↗' }));
    const href = String(nav.mock.calls[0][0]);
    expect(href).toContain('/trend');
    expect(decodeURIComponent(href)).toContain('root.a.sp');
    expect(decodeURIComponent(href)).not.toContain('root.a.pv');
  });

  it('ends with the signal quality, Signal bindings → and Open signals in Trend ↗', () => {
    tab();
    expect(screen.getByText('Good')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Signal bindings →' }));
    expect(String(nav.mock.calls[0][0])).toContain('/cpm/registry');
    expect(screen.getByRole('button', { name: 'Open signals in Trend ↗' })).toBeTruthy();
  });

  it('drops the heading that restated the table', () => {
    tab();
    expect(screen.queryByText('Signal mappings')).toBeNull();
    expect(screen.queryByText(/role\(s\) mapped/)).toBeNull();
  });
});
