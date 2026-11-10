// @vitest-environment jsdom
// CHG-159 (owner review, 10 Nov): the foot under the chart says how many results the range holds and opens the Result
// key; the zoom buttons moved up into the head row.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
import ChartFoot from './ChartFoot';

afterEach(cleanup);

describe('ChartFoot', () => {
  it('holds the results count and Result key, and no zoom buttons', () => {
    render(<ChartFoot results={12} windowKind="12h" capped={false} cap={500} />);
    expect(screen.getByText('12 results · 12h rolling windows')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Zoom area|Undo|Reset/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Result key' }));
    expect(screen.getByRole('dialog', { name: 'Result key' })).toBeTruthy();
  });

  it('names the cap when more windows exist than were read', () => {
    render(<ChartFoot results={500} windowKind="24h" capped cap={500} />);
    expect(screen.getByText('500 results · 24h rolling windows · newest 500 read')).toBeTruthy();
  });
});
