// CHG-165: System Response as six tabs in `?tab=`, plain labels, the event once in the foot and Next to the following tab.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResponseTabs, tabOf } from './ResponseTabs';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);
const at = (q: string) => new URLSearchParams(q);

describe('tabOf', () => {
  it('reads the tab from the address, else opens Response for a chosen event and Events otherwise', () => {
    expect(tabOf(at('tab=fit&event=e1'))).toBe('fit');
    expect(tabOf(at('event=e1'))).toBe('response');
    expect(tabOf(at('methodRun=r1'))).toBe('response');
    expect(tabOf(at('loop=FIC1'))).toBe('events');
    expect(tabOf(at('tab=nonsense'))).toBe('events');
  });
});

describe('ResponseTabs', () => {
  it('shows the six tabs with plain labels, the foot text and Next to the following tab', () => {
    const onTab = vi.fn();
    render(<ResponseTabs tab="fit" onTab={onTab} foot="Input test · run 6a1e89ce"><p>body</p></ResponseTabs>);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Events', 'Response', 'Fit quality', 'Frequency', 'Steps & data', 'Models']);
    expect(screen.getByText('Input test · run 6a1e89ce')).toBeTruthy();
    fireEvent.click(screen.getByText('Next: Frequency →'));
    expect(onTab).toHaveBeenCalledWith('frequency');
  });

  it('has no Next on the last tab', () => {
    render(<ResponseTabs tab="models" onTab={() => {}}><p>body</p></ResponseTabs>);
    expect(screen.queryByText(/^Next:/)).toBeNull();
  });
});
