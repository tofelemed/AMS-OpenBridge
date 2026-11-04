// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { deepActiveElement } from './focusTrap';
import { useDialogA11y } from './useDialogA11y';

const Drawer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useDialogA11y(onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
      <button>First</button>
      <button>Last</button>
    </div>
  );
};

/** Trigger whose button lives in a shadow root, as ObcButton's does. */
class ShadowTrigger extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const button = document.createElement('button');
    button.textContent = 'Open';
    this.attachShadow({ mode: 'open' }).appendChild(button);
  }
}
if (!customElements.get('shadow-trigger')) customElements.define('shadow-trigger', ShadowTrigger);

const Page: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {React.createElement('shadow-trigger', { 'data-testid': 'trigger' })}
      <button onClick={() => setOpen(true)}>Show</button>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
};

afterEach(cleanup);

describe('useDialogA11y', () => {
  it('starts inside the drawer and keeps Tab there', () => {
    render(<Page />);
    fireEvent.click(screen.getByText('Show'));
    expect(deepActiveElement()).toBe(screen.getByText('First'));
    screen.getByText('Last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(deepActiveElement()).toBe(screen.getByText('First'));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(deepActiveElement()).toBe(screen.getByText('Last'));
  });

  it('closes on Escape', () => {
    render(<Page />);
    fireEvent.click(screen.getByText('Show'));
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns focus to a trigger button inside a shadow root', () => {
    const Harness: React.FC = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          {React.createElement('shadow-trigger', { 'data-testid': 'trigger' })}
          <button data-testid="open-programmatically" onClick={() => setOpen(true)} />
          {open && <Drawer onClose={() => setOpen(false)} />}
        </>
      );
    };
    render(<Harness />);
    const inner = screen.getByTestId('trigger').shadowRoot!.querySelector('button')!;
    inner.focus();
    // A real click would move focus to the button, so open without moving it: this is the state
    // an ObcButton trigger leaves, with focus held inside its shadow root.
    act(() => {
      screen.getByTestId('open-programmatically').click();
    });
    expect(deepActiveElement()).toBe(screen.getByText('First'));
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(deepActiveElement()).toBe(inner);
  });
});
