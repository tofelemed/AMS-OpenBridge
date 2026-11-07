// CHG-140: "Configuration this run used" reads the configuration as of the run's window, not today's.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const useEffectiveConfig = vi.hoisted(() => vi.fn(() => ({ isLoading: true, isError: false, data: undefined })));
vi.mock('./useConfig', () => ({ useEffectiveConfig }));
vi.mock('./EffectiveView', () => ({ EffectiveView: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode }) => React.createElement('button', null, p.children),
}));

import { EffectiveConfigDrawer } from './EffectiveConfigDrawer';
afterEach(() => { cleanup(); useEffectiveConfig.mockClear(); });

describe('EffectiveConfigDrawer', () => {
  it('passes the run window end as the instant to read at', () => {
    render(<MemoryRouter><EffectiveConfigDrawer loopId="FIC10401" at="2026-10-05T12:30:00.000Z" /></MemoryRouter>);
    expect(useEffectiveConfig).toHaveBeenCalledWith('FIC10401', '2026-10-05T12:30:00.000Z');
    expect(screen.getByText('Configuration this run used')).toBeTruthy();
  });
  it('without an instant it reads the configuration in force now', () => {
    render(<MemoryRouter><EffectiveConfigDrawer loopId="FIC10401" /></MemoryRouter>);
    expect(useEffectiveConfig).toHaveBeenCalledWith('FIC10401', undefined);
    expect(screen.getByText('Effective configuration')).toBeTruthy();
  });
});
