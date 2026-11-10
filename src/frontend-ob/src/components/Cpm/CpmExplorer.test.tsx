// @vitest-environment jsdom
// CHG-158 (owner review): no ? on the Loop Explorer title.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: { loops: [] }, isLoading: false, isError: false, error: null, refetch: () => {} }) }));
vi.mock('./plantScope', () => ({ useCpmScope: () => ({ active: false, matches: () => true, params: {} }) }));
vi.mock('./explorer/LoopTree', () => ({ default: () => null }));
vi.mock('./explorer/summary/WindowKindToggle', () => ({ default: () => null }));

import CpmExplorer from './CpmExplorer';

afterEach(cleanup);

describe('CpmExplorer', () => {
  it('has no ? on the page title', () => {
    render(<MemoryRouter initialEntries={['/cpm/explorer']}><CpmExplorer /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Loop Explorer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Loop Explorer' })).toBeNull();
  });
});
