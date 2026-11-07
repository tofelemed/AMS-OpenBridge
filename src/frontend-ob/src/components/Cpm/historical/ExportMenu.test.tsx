// @vitest-environment jsdom
// Follow-up to B1: the Export menu names the real cause when the selected window has only a summary.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
import { ExportMenu } from './RangeToolbar';
import { packageReason } from './useWindowKpis';

afterEach(cleanup);
const open = (over = {}) => {
  render(<ExportMenu loopId="L1" exportDisabled={false} onExport={() => {}} {...over} />);
  fireEvent.click(screen.getByRole('button', { name: /Export/ }));
};

describe('ExportMenu evidence package reason', () => {
  it('asks for a window when none is selected', () => {
    open({ packageWindow: null });
    expect(document.body.textContent).toContain('Choose an evaluated window to export its evidence package.');
  });
  it('gives the cause, not "choose a window", when the selected window has only a summary', () => {
    const why = packageReason(new Date(Date.now() - 2 * 86_400_000).toISOString());
    open({ packageWindow: null, packageUnavailable: why });
    expect(document.body.textContent).toContain('newest 500 windows');
    expect(document.body.textContent).not.toContain('Choose an evaluated window');
  });
});
