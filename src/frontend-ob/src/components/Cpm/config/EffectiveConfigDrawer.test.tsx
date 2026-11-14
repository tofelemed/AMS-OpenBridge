// The Loop Explorer's drawer reads the configuration in force now. CHG-184: the Workbench's "Configuration this run used"
// (the run's instant) went with the Rules & parameters Configuration section.
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
  it('reads the configuration in force now', () => {
    render(<MemoryRouter><EffectiveConfigDrawer loopId="FIC10401" /></MemoryRouter>);
    expect(useEffectiveConfig).toHaveBeenCalledWith('FIC10401');
    expect(screen.getByText('Effective configuration')).toBeTruthy();
    expect(screen.queryByText('Configuration this run used')).toBeNull();
  });
});
