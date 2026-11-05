// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from './OverviewPage';

vi.mock('../../components/Cpm/CpmOverview', () => ({ default: () => <p>overview</p> }));
vi.mock('../../components/Cpm/CpmKpiDrilldown', () => ({ default: () => <p>drill-down</p> }));

afterEach(cleanup);

const open = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <React.Suspense fallback={null}><OverviewPage /></React.Suspense>
  </MemoryRouter>,
);

describe('OverviewPage', () => {
  it('shows Overview on its own', async () => {
    open('/cpm?site=a&window=24h');
    expect(await screen.findByText('overview')).toBeTruthy();
    expect(screen.queryByText('drill-down')).toBeNull();
  });

  it('opens a KPI drill-down in place', async () => {
    open('/cpm?review=stale&site=a');
    expect(await screen.findByText('drill-down')).toBeTruthy();
    expect(screen.queryByText('overview')).toBeNull();
  });
});
