// Task 21: the G12 evidence view hands the run to System Response through the router, with its explanation behind the ?.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { G12Response } from './FusionViews';
import type { GateViewProps } from '../EvidenceArtifactRenderer';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);
const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;

describe('G12Response', () => {
  it('opens System Response for the method run without a page reload', () => {
    const manifest = { methodRunId: 'run 1', artifacts: [{ provenance: { loop_id: 'FIC1' } }] } as unknown as GateViewProps['manifest'];
    render(<MemoryRouter><G12Response {...({ manifest } as GateViewProps)} /><Where /></MemoryRouter>);
    expect(screen.queryByText(/G12 is event-keyed/)).toBeNull();
    fireEvent.click(screen.getByText(/Open in System Response/));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/response?loop=FIC1&methodRun=run+1');
  });
});
