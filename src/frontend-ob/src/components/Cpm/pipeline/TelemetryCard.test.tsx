import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TelemetryCard from './TelemetryCard';

vi.mock('echarts-for-react', () => ({ default: () => null }));
vi.mock('../../charts/ChartZoomBar', () => ({ default: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
afterEach(cleanup);

describe('TelemetryCard', () => {
  it('says the chart holds only what was collected while the page is open', () => {
    render(<TelemetryCard metrics={undefined} lastVerdictAgeMin={5} />);
    expect(screen.getByText(/Held only while this page is open/)).toBeTruthy();
  });

  it('shows Not exposed for what the engine metrics do not carry', () => {
    render(<TelemetryCard metrics={undefined} lastVerdictAgeMin={null} />);
    expect(screen.getAllByText('Not exposed').length).toBe(5);
    expect(screen.getByText('none stored yet')).toBeTruthy();
  });
});
