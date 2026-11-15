// CHG-165: System Response as six tabs in `?tab=`, plain labels and Next to the following tab (CHG-195: no foot line).
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
  // CHG-195 (owner review item 19): no foot line under a tab; the event selector names the event. Next stays.
  it('shows the six tabs with plain labels and, under the tab, only Next to the following tab', () => {
    const onTab = vi.fn();
    const { container } = render(<ResponseTabs tab="fit" onTab={onTab}><p>body</p></ResponseTabs>);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Events', 'Response', 'Fit quality', 'Frequency', 'Steps & data', 'Models']);
    const foot = container.querySelector('.cpm-response-tabs__foot') as HTMLElement;
    expect(foot.textContent).toBe('Next: Frequency →');
    expect(foot.querySelector('.cpm-copy')).toBeNull();
    fireEvent.click(screen.getByText('Next: Frequency →'));
    expect(onTab).toHaveBeenCalledWith('frequency');
  });

  it('has no Next on the last tab', () => {
    render(<ResponseTabs tab="models" onTab={() => {}}><p>body</p></ResponseTabs>);
    expect(screen.queryByText(/^Next:/)).toBeNull();
  });
});
