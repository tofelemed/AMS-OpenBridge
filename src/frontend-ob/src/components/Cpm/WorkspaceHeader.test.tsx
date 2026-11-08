// @vitest-environment jsdom
// CHG-156 / CHG-157: a page header can go without its title ? (Performance, Overview); otherwise the page's purpose sits behind it.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceHeader } from './shared';

afterEach(cleanup);

const show = (copy?: string) => render(<MemoryRouter><WorkspaceHeader page="/cpm" title="Overview" copy={copy} /></MemoryRouter>);

describe('WorkspaceHeader', () => {
  it('puts the page purpose behind a ? on the title by default', () => {
    show();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
  });

  it('shows no ? when the page passes empty help text', () => {
    show('');
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull();
  });
});
