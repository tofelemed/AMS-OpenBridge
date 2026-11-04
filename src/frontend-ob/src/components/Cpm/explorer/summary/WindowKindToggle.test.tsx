// 2026-10-03 (user request): the Summary gate strip was pinned to the 24 h fused window; the operator
// wants 12 h / 24 h side by side, written to ?window= exactly as Performance does.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import WindowKindToggle from './WindowKindToggle';

afterEach(cleanup);

const options = () => within(screen.getByRole('group', { name: 'Fused evaluation window' })).getAllByRole('button');

describe('WindowKindToggle', () => {
  it('renders one option per served fused kind with the current one selected', () => {
    render(<WindowKindToggle value="24h" kinds={['12h', '24h']} onChange={() => {}} />);
    expect(options().map(o => o.textContent)).toEqual(['12h', '24h']);
    expect(options().map(o => o.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('forwards another served kind and stays quiet on the selected one', () => {
    const onChange = vi.fn();
    render(<WindowKindToggle value="24h" kinds={['12h', '24h']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '12h' }));
    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    expect(onChange.mock.calls).toEqual([['12h']]);
  });

  it('reads a kind the engine does not fuse as the first served kind, and writes nothing back', () => {
    const onChange = vi.fn();
    render(<WindowKindToggle value="7d" kinds={['12h', '24h']} onChange={onChange} />);
    expect(options().map(o => o.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(onChange).not.toHaveBeenCalled();
  });
});
