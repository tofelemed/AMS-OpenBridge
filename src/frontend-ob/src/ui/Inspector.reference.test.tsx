// @vitest-environment jsdom
// CHG-190 (owner review 2026-11-14, items 13 and 14): the owner's reference design for a detail panel, in the shared Inspector and
// DetailsGrid. The title with its ? and links top right (in the drawer under the band), a Details grid between the rows and the foot,
// the primary full width on the page colour, even rows.
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Inspector } from './Inspector';
import { DetailsGrid } from './DetailsGrid';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setWidth = (narrow: boolean) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: narrow && q.includes('1279'), addEventListener: () => undefined, removeEventListener: () => undefined }));
};

const Panel: React.FC<{ onOpen?: () => void }> = ({ onOpen = () => undefined }) => (
  <Inspector variant="reference" title="15 min window" open onClose={() => undefined}
    titleTip={<button type="button">About</button>}
    actions={<button type="button">Historical ↗</button>}
    details={<DetailsGrid items={[{ label: 'Sample density', dialog: true, onClick: onOpen }, { label: 'Rules', disabled: true, onClick: () => undefined }]} />}
    primaryAction={<button type="button">Inspect this window →</button>}>
    <div className="cpm-kv">Row</div>
  </Inspector>
);

describe('Inspector, reference design', () => {
  it('puts the title, its ? and the links in the head on a wide screen', () => {
    setWidth(false);
    render(<Panel />);
    const head = document.querySelector('.ui-inspector__head') as HTMLElement;
    expect(within(head).getByRole('heading', { name: '15 min window' }).parentElement?.className).toBe('ui-inspector__title-row');
    expect(within(head).getByRole('button', { name: 'About' })).toBeTruthy();
    expect(within(head).getByRole('button', { name: 'Historical ↗' }).closest('.ui-inspector__actions')).toBeTruthy();
    expect(screen.getByRole('complementary').className).toBe('ui-inspector ui-inspector--reference');
  });

  it('moves the links under the band in the drawer, where the band is the action colour', () => {
    setWidth(true);
    render(<Panel />);
    const dialog = screen.getByRole('dialog', { name: '15 min window' });
    expect(dialog.className).toBe('ui-inspector ui-inspector--drawer ui-inspector--reference');
    expect(within(dialog.querySelector('.ui-inspector__head') as HTMLElement).queryByRole('button', { name: 'Historical ↗' })).toBeNull();
    expect(within(dialog.querySelector('.ui-inspector__body') as HTMLElement).getByRole('button', { name: 'Historical ↗' })).toBeTruthy();
  });

  it('puts the Details grid between the rows and the foot; a button opens its dialog or is disabled', () => {
    setWidth(false);
    const open = vi.fn();
    render(<Panel onOpen={open} />);
    const grid = screen.getByRole('region', { name: 'Details' });
    expect(grid.previousElementSibling?.className).toBe('ui-inspector__body');
    expect(grid.nextElementSibling?.className).toBe('ui-inspector__foot');
    const density = within(grid).getByRole('button', { name: 'Sample density' });
    expect(density.getAttribute('aria-haspopup')).toBe('dialog');
    expect(density.className).toContain('ui-btn--secondary');
    fireEvent.click(density);
    expect(open).toHaveBeenCalled();
    expect((within(grid).getByRole('button', { name: 'Rules' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaves an Inspector without the variant as it was', () => {
    setWidth(false);
    render(<Inspector title="Loop" open onClose={() => undefined}>Detail</Inspector>);
    expect(screen.getByRole('complementary').className).toBe('ui-inspector');
    expect(document.querySelector('.ui-inspector__title-row')).toBeNull();
    expect(document.querySelector('.ui-inspector__actions')).toBeNull();
  });
});

describe('Reference design rules (tokens only)', () => {
  const css = readFileSync(join(__dirname, 'inspector-reference.css'), 'utf8');
  const page = readFileSync(join(__dirname, '../styles/cpm-master-detail.css'), 'utf8');
  it('draws the Details grid in two columns under a rule, and the foot on the page colour with a full-width primary', () => {
    expect(css).toMatch(/\.ui-details__grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.ui-details \{[^}]*border-top: 1px solid var\(--traverse-border-subtle\)/);
    expect(css).toMatch(/\.ui-inspector--reference \.ui-inspector__foot \{[^}]*background: var\(--traverse-surface-page\)/);
    expect(css).toMatch(/\.ui-inspector--reference \.ui-inspector__foot > obc-button \{ display: block; width: 100%; \}/);
    expect(page).toMatch(/\.ui-inspector--reference \.ui-inspector__foot \.cpm-reasoned > obc-button \{ display: block; width: 100%; \}/);
  });

  it('makes the rows even: one compact row height, centred, no rule between them', () => {
    expect(page).toMatch(/\.ui-inspector--reference \.cpm-kv \{[^}]*align-items: center;[^}]*min-height: var\(--traverse-size-row-compact\);[^}]*border-bottom: 0;/);
  });

  it('uses no colour literal', () => {
    for (const text of [css, page]) expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/);
  });
});
