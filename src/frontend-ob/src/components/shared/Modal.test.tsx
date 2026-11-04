// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './Modal';
import { deepActiveElement, focusableIn } from '../../hooks/focusTrap';

class FooterButton extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const button = document.createElement('button');
    button.textContent = 'Save';
    this.attachShadow({ mode: 'open' }).appendChild(button);
  }
}
if (!customElements.get('footer-button')) customElements.define('footer-button', FooterButton);

afterEach(cleanup);

describe('Modal focus (RD12)', () => {
  const open = () => render(
    <Modal isOpen onClose={() => undefined} title="Edit" footer={React.createElement('footer-button', { 'data-testid': 'footer' })}>
      <input aria-label="Name" />
    </Modal>,
  );

  it('starts on the first form field', () => {
    open();
    expect(deepActiveElement()).toBe(screen.getByLabelText('Name'));
  });

  it('counts a footer button inside a shadow root as the last stop in the dialog', () => {
    open();
    const footer = screen.getByTestId('footer').shadowRoot!.querySelector('button')!;
    expect(focusableIn(screen.getByRole('dialog')).at(-1)).toBe(footer);
  });

  it('wraps forward from the footer button instead of leaving the dialog', () => {
    open();
    const footer = screen.getByTestId('footer').shadowRoot!.querySelector('button')!;
    const first = focusableIn(screen.getByRole('dialog'))[0];
    footer.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(deepActiveElement()).toBe(first);
  });

  it('wraps backward from the first control to the footer button', () => {
    open();
    const footer = screen.getByTestId('footer').shadowRoot!.querySelector('button')!;
    focusableIn(screen.getByRole('dialog'))[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(deepActiveElement()).toBe(footer);
  });
});
