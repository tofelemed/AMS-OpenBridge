// What the OpenBridge controls gave their pages, and the replacements have to keep (DEC-002 RD2).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import type { SystemModel } from '../../api/cpm/response';
import RolesConfig from '../../components/Administration/RolesConfig';
import { GateMatrix } from '../../components/Cpm/GateMatrix';
import { RANGE_PRESETS } from '../../components/Cpm/historical/timeRange';
import { ModelReviewDialog } from '../../components/Cpm/response/ModelReviewDialog';
import { TimeRangeBar } from '../../components/Cpm/trend/TimeRangeBar';

const { updateRole } = vi.hoisted(() => ({ updateRole: vi.fn(async () => undefined) }));
vi.mock('../../api/rolesApi', () => ({
  getRoles: async () => [
    { role_name: 'Shift', description: 'Runs the shift', is_system_role: false },
    { role_name: 'Viewer', description: 'Reads', is_system_role: true },
  ],
  getPermissionCatalog: async () => [],
  getRolePermissions: async () => [],
  setRolePermissions: vi.fn(),
  resetRolePermissions: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
  updateRole,
  extractRoleApiError: (e: unknown) => String(e),
}));
vi.mock('../../components/shared/dialogService', () => ({ usePrompt: () => vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));

afterEach(() => { cleanup(); updateRole.mockClear(); });

describe('Role description field', () => {
  it('saves when the edit is committed, not per keystroke, and follows the selected role', async () => {
    render(<RolesConfig />);
    const field = await screen.findByRole('textbox', { name: 'Role description' }) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe('Reads'));

    fireEvent.input(field, { target: { value: 'Reads all' } });
    expect(updateRole).not.toHaveBeenCalled();
    await act(async () => { field.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(updateRole.mock.calls).toEqual([['Viewer', { description: 'Reads all' }]]);

    fireEvent.click(screen.getByRole('button', { name: /Shift/ }));
    await waitFor(() => expect(field.value).toBe('Runs the shift'));
  });
});

describe('Time range presets', () => {
  const mount = (onPreset: (key: string) => void) => render(
    <TimeRangeBar from={new Date(0)} to={new Date(86_400_000)} presets={RANGE_PRESETS} preset="7d"
      onPreset={onPreset} onStep={() => {}} onNow={() => {}} onApplyCustom={() => null} />,
  );

  it('chooses a preset from one dropdown', () => {
    const onPreset = vi.fn();
    mount(onPreset);
    const range = screen.getByRole('combobox', { name: 'Range' }) as HTMLSelectElement;
    expect(range.value).toBe('7d');
    fireEvent.change(range, { target: { value: '30d' } });
    expect(onPreset.mock.calls).toEqual([['30d']]);
  });

  it('opens the custom pair without choosing a preset', () => {
    const onPreset = vi.fn();
    mount(onPreset);
    expect(screen.queryByText('From')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Range' }), { target: { value: 'custom' } });
    expect(screen.getByText('From')).toBeTruthy();
    expect(onPreset).not.toHaveBeenCalled();
  });
});

describe('A segmented group under a field label', () => {
  it('keeps its selection when the label text is clicked', () => {
    const model = { family: 'f', pathId: 'p', modelState: 'CANDIDATE', modelId: 'm', revision: 1, parameters: {} } as unknown as SystemModel;
    render(<ModelReviewDialog model={model} pending={false} error={null} onClose={() => {}} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rejected' }));
    fireEvent.click(screen.getByText('Decision'));
    expect(screen.getByRole('button', { name: 'Rejected' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Gate matrix toolbar', () => {
  const noop = () => {};
  const mount = (over: Partial<React.ComponentProps<typeof GateMatrix>>, loops: CpmHeatmapLoop[] = []) => render(
    <MemoryRouter>
      <GateMatrix loops={loops} orderedGateKeys={[]} tierGroups={[]} filter={{ mode: 'all', gate: null }} onFilterChange={noop}
        page={1} onPageChange={noop} selectedLoopId={null} onSelectLoop={noop} onOpenLoop={noop} onOpenGate={noop} {...over} />
    </MemoryRouter>,
  );

  it('writes a new row filter or view', () => {
    const onFilterChange = vi.fn();
    const onViewChange = vi.fn();
    mount({ onFilterChange, onViewChange });
    fireEvent.change(screen.getByRole('combobox', { name: 'Row filter' }), { target: { value: 'evaluated' } });
    expect(onFilterChange.mock.calls).toEqual([[{ mode: 'evaluated' }]]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Matrix view' }), { target: { value: 'matrix' } });
    expect(onViewChange.mock.calls).toEqual([['matrix']]);
  });

  it('shows the failing-gate filter as a pressed chip that clears the gate', () => {
    const onFilterChange = vi.fn();
    mount({ filter: { mode: 'all', gate: 'G1' }, onFilterChange });
    const chip = screen.getByRole('button', { name: 'Failing G1' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onFilterChange.mock.calls).toEqual([[{ gate: null }]]);
  });

  it('pages through the rows and hides the pager when one page is enough', () => {
    const onPageChange = vi.fn();
    const rows = Array.from({ length: 30 }, (_, i) => ({ loopId: `L${i}`, displayName: `Loop ${i}`, gates: {} })) as unknown as CpmHeatmapLoop[];
    const { unmount } = mount({ onPageChange }, rows);
    expect(screen.getByRole('navigation', { name: 'Pagination' }).querySelector('.ui-pagination__status')?.textContent).toBe('Page 1 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange.mock.calls).toEqual([[2]]);
    unmount();
    mount({ onPageChange }, rows.slice(0, 5));
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });
});
