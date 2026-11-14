// CHG-183 (owner review 2026-11-14, item 2): the dialog head is a band with the title, an optional subtitle under
// it and the close button. The band's colours are guarded in styles/buttonStandard.test.ts.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog band', () => {
  it('shows the subtitle under the title, beside the close button', () => {
    render(<Dialog open onClose={() => undefined} title="Evaluate a window" subtitle="FIC10401 · Flow controller"><p>Body</p></Dialog>);
    const head = screen.getByRole('dialog', { name: 'Evaluate a window' }).querySelector<HTMLElement>('.ui-dialog__head')!;
    const subtitle = within(head).getByText('FIC10401 · Flow controller');
    expect(subtitle.className).toBe('ui-dialog__subtitle');
    expect(subtitle.previousElementSibling?.textContent).toBe('Evaluate a window');
    expect(within(head).getByRole('button', { name: 'Close dialog' })).toBeTruthy();
  });

  it('shows no subtitle line when none is given, and keeps the title as the dialog name', () => {
    render(<Dialog open onClose={() => undefined} title="Evaluate a window"><p>Body</p></Dialog>);
    expect(screen.getByRole('dialog', { name: 'Evaluate a window' })).toBeTruthy();
    expect(document.querySelector('.ui-dialog__subtitle')).toBeNull();
  });
});
