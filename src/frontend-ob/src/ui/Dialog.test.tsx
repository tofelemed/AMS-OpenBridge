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

// CHG-193 (final review M5): a screen reader hears the subtitle with the dialog ("Delete role" + the role name).
describe('Dialog subtitle is described', () => {
  it('joins the subtitle to aria-describedby', () => {
    render(<Dialog open onClose={() => undefined} title="Delete role" subtitle="Plant engineer"><p>Body</p></Dialog>);
    expect(screen.getByRole('dialog', { name: 'Delete role' }).getAttribute('aria-describedby')).toBeTruthy();
    const dialog = screen.getByRole('dialog', { name: 'Delete role' });
    const ids = dialog.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map(id => document.getElementById(id)?.textContent)).toEqual(['Plant engineer']);
  });

  it('keeps the description id beside the subtitle id, subtitle first', () => {
    render(<Dialog open onClose={() => undefined} title="Delete role" subtitle="Plant engineer" description="This cannot be undone."><p>Body</p></Dialog>);
    const ids = screen.getByRole('dialog', { name: 'Delete role' }).getAttribute('aria-describedby')!.split(' ');
    expect(ids.map(id => document.getElementById(id)?.textContent)).toEqual(['Plant engineer', 'This cannot be undone.']);
  });

  it('has no aria-describedby with neither a subtitle nor a description', () => {
    render(<Dialog open onClose={() => undefined} title="Delete role"><p>Body</p></Dialog>);
    expect(screen.getByRole('dialog', { name: 'Delete role' }).hasAttribute('aria-describedby')).toBe(false);
  });
});
