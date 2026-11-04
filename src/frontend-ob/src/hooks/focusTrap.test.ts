// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deepActiveElement, focusInitial, focusableIn, trapTab } from './focusTrap';

/** A stand-in for ObcButton: the real <button> lives inside an open shadow root. */
function shadowButton(label: string): { host: HTMLElement; inner: HTMLButtonElement } {
  const host = document.createElement('div');
  const inner = document.createElement('button');
  inner.textContent = label;
  host.attachShadow({ mode: 'open' }).appendChild(inner);
  return { host, inner };
}

const tab = (shiftKey = false) => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
  vi.spyOn(event, 'preventDefault');
  return event;
};

describe('focusTrap', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.tabIndex = -1;
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('finds buttons inside shadow roots, in document order', () => {
    const input = document.createElement('input');
    const { host, inner } = shadowButton('Save');
    root.append(input, host);
    expect(focusableIn(root)).toEqual([input, inner]);
  });

  it('skips disabled, hidden and tabindex -1 controls', () => {
    const disabled = document.createElement('button');
    disabled.disabled = true;
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    const negative = document.createElement('button');
    negative.tabIndex = -1;
    const collapsed = document.createElement('button');
    collapsed.style.display = 'none';
    root.append(disabled, hidden, negative, collapsed);
    expect(focusableIn(root)).toEqual([]);
  });

  it('reports the element inside a shadow root as the active element, not its host', () => {
    const { host, inner } = shadowButton('Open');
    root.append(host);
    inner.focus();
    expect(document.activeElement).toBe(host);
    expect(deepActiveElement()).toBe(inner);
  });

  it('wraps Tab from a footer button in a shadow root back to the first control', () => {
    const input = document.createElement('input');
    const { host, inner } = shadowButton('Save');
    root.append(input, host);
    inner.focus();
    const event = tab();
    trapTab(event, root);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(deepActiveElement()).toBe(input);
  });

  it('wraps Shift+Tab from the first control to a footer button in a shadow root', () => {
    const input = document.createElement('input');
    const { host, inner } = shadowButton('Save');
    root.append(input, host);
    input.focus();
    trapTab(tab(true), root);
    expect(deepActiveElement()).toBe(inner);
  });

  it('leaves Tab alone between controls so the browser moves focus normally', () => {
    const a = document.createElement('input');
    const b = document.createElement('input');
    root.append(a, b);
    a.focus();
    const event = tab();
    trapTab(event, root);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('pulls focus back in when it has escaped the container', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const input = document.createElement('input');
    root.append(input);
    outside.focus();
    trapTab(tab(), root);
    expect(deepActiveElement()).toBe(input);
  });

  it('focuses the container when it holds no controls', () => {
    const event = tab();
    trapTab(event, root);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(root);
  });

  it('prefers a form field over a header close button on open', () => {
    const { host } = shadowButton('Close');
    const input = document.createElement('input');
    root.append(host, input);
    focusInitial(root);
    expect(deepActiveElement()).toBe(input);
  });

  it('falls back to the first button when there is no field', () => {
    const { host, inner } = shadowButton('Close');
    root.append(host);
    focusInitial(root);
    expect(deepActiveElement()).toBe(inner);
  });
});
