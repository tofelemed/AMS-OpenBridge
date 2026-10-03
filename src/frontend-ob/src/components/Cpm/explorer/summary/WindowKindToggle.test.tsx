// 2026-10-03 (user request): the Summary gate strip was pinned to the 24 h fused window; the operator
// wants 12 h / 24 h side by side, written to ?window= exactly as Performance does.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React, { useEffect, useRef } from 'react';

// The Lit group never assigns its slot under jsdom (value reads '' and the event
// listener is lost), so both wrappers are stubbed the way LoopModelCard.test stubs
// ObcButton: a plain element that keeps the value and forwards the `value` DOM event.
vi.mock('@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group', () => ({
  ObcToggleButtonGroup: (p: { value: string; children?: React.ReactNode; onValue?: (e: Event) => void }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = ref.current; const h = p.onValue;
      if (!el || !h) return;
      el.addEventListener('value', h);
      return () => el.removeEventListener('value', h);
    }, [p.onValue]);
    return React.createElement('obc-toggle-button-group', { ref, value: p.value }, p.children);
  },
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option', () => ({
  ObcToggleButtonOption: (p: { value: string; children?: React.ReactNode }) =>
    React.createElement('obc-toggle-button-option', { value: p.value }, p.children),
}));
import WindowKindToggle from './WindowKindToggle';

afterEach(cleanup);

describe('WindowKindToggle', () => {
  it('renders one option per served fused kind with the current one selected', () => {
    const { container } = render(<WindowKindToggle value="24h" kinds={['12h', '24h']} onChange={() => {}} />);
    const group = container.querySelector('obc-toggle-button-group');
    expect(group).not.toBeNull();
    expect(group!.getAttribute('value')).toBe('24h');
    const opts = Array.from(container.querySelectorAll('obc-toggle-button-option')).map(o => o.textContent);
    expect(opts).toEqual(['12h', '24h']);
  });

  it('forwards a served kind and drops an empty or unknown emit', () => {
    const onChange = vi.fn();
    const { container } = render(<WindowKindToggle value="24h" kinds={['12h', '24h']} onChange={onChange} />);
    const group = container.querySelector('obc-toggle-button-group')!;
    fireEvent(group, new CustomEvent('value', { detail: { value: '12h' } }));
    fireEvent(group, new CustomEvent('value', { detail: { value: '' } }));
    fireEvent(group, new CustomEvent('value', { detail: { value: '7d' } }));
    expect(onChange.mock.calls).toEqual([['12h']]);
  });
});
