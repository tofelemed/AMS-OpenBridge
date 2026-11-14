// CHG-183 (owner review 2026-11-14, item 17): the button standard. Each level maps to an OpenBridge family and,
// for ghost and link, to the opt-out class the bridge styles on the host. A disabled action still says why.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, variant, className, disabled, onClick, ...rest }: {
    children?: React.ReactNode; variant?: string; className?: string; disabled?: boolean; onClick?: () => void; 'aria-describedby'?: string;
  }) => React.createElement('button', { type: 'button', 'data-variant': variant, className, disabled, onClick, 'aria-describedby': rest['aria-describedby'] }, children),
}));

import { Button, type ButtonVariant } from './Button';

const host = (name: string) => screen.getByRole('button', { name });

afterEach(cleanup);

describe('Button: one standard for every action', () => {
  it.each<[ButtonVariant, string, string | null]>([
    ['primary', 'raised', null],
    ['secondary', 'normal', null],
    ['destructive', 'raised', null],
    ['ghost', 'flat', 'ui-ghost'],
    ['link', 'flat', 'ui-link'],
  ])('%s is the %s family with host class %s', (variant, family, cls) => {
    render(<Button variant={variant}>Act</Button>);
    const b = host('Act');
    expect(b.getAttribute('data-variant')).toBe(family);
    expect(b.getAttribute('class')).toBe(cls);
    expect(b.closest('.ui-button')?.classList.contains(`ui-button--${variant}`)).toBe(true);
  });

  it('is secondary when no level is named, since most actions are', () => {
    render(<Button>Cancel</Button>);
    expect(host('Cancel').getAttribute('data-variant')).toBe('normal');
    expect(host('Cancel').closest('.ui-button--secondary')).not.toBeNull();
  });

  it('says why while disabled, tied to the button for screen readers', () => {
    render(<Button variant="primary" disabled reason="Needs Edit permission">Evaluate</Button>);
    const b = host('Evaluate');
    expect((b as HTMLButtonElement).disabled).toBe(true);
    const why = screen.getByText('Needs Edit permission');
    expect(b.getAttribute('aria-describedby')).toBe(why.id);
  });

  it('shows no reason while enabled', () => {
    render(<Button variant="primary" reason="Needs Edit permission">Evaluate</Button>);
    expect(screen.queryByText('Needs Edit permission')).toBeNull();
    expect(host('Evaluate').getAttribute('aria-describedby')).toBeNull();
  });
});
