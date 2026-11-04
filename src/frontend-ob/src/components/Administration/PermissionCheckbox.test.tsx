// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PermissionCheckbox from './PermissionCheckbox';

afterEach(cleanup);

describe('PermissionCheckbox (RD12)', () => {
  it('is announced by its permission key', () => {
    render(<PermissionCheckbox permissionKey="cpm.manage" checked={false} onToggle={() => undefined} />);
    expect(screen.getByRole('checkbox', { name: 'cpm.manage' })).toBeTruthy();
  });

  it('gives each permission a different name', () => {
    render(
      <>
        <PermissionCheckbox permissionKey="cpm.manage" checked onToggle={() => undefined} />
        <PermissionCheckbox permissionKey="system.manage" checked={false} onToggle={() => undefined} />
      </>,
    );
    const names = screen.getAllByRole('checkbox').map(el => el.closest('label')?.textContent);
    expect(names).toEqual(['cpm.manage', 'system.manage']);
  });

  it('reflects the checked state and reports a toggle', () => {
    const onToggle = vi.fn();
    render(<PermissionCheckbox permissionKey="cpm.manage" checked onToggle={onToggle} />);
    const box = screen.getByRole('checkbox', { name: 'cpm.manage' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
