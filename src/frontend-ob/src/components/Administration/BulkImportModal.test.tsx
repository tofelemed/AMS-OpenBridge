// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample, badge 7): Bulk import users in three tabs, File · Preview · Result; Columns with
// Download template; the counts in one line; the options, rows and every check unchanged; the same two requests.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { validateBulkImport, executeBulkImport, getImportTemplate } = vi.hoisted(() => ({
  validateBulkImport: vi.fn(), executeBulkImport: vi.fn(), getImportTemplate: vi.fn(),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../api/usersApi', async () => {
  const real = await vi.importActual<typeof import('../../api/usersApi')>('../../api/usersApi');
  return { ...real, validateBulkImport, executeBulkImport, getImportTemplate };
});
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BulkImportModal } from './BulkImportModal';

const CSV = 'username,email,full_name,password,role,is_active\nj_engineer,engineer.j@example.test,J. Engineer,Passw0rdX,Engineer,true\nm,not-an-address,,Passw0rdX,Viewer,true';
const csvFile = (name: string, text: string) => {
  const f = new File([text], name, { type: 'text/csv' });
  Object.defineProperty(f, 'text', { value: async () => text });
  return f;
};
const validation = {
  totalRows: 2, validRows: 1, errorRows: 1, warningRows: 0, duplicateRows: 0,
  rows: [
    { row_number: 2, data: { username: 'j_engineer', email: 'engineer.j@example.test', role: 'Engineer' }, status: 'valid', errors: [], warnings: [] },
    { row_number: 3, data: { username: 'm', email: 'not-an-address', role: 'Viewer' }, status: 'error', errors: ['Invalid email format'], warnings: [] },
  ],
};

const onClose = vi.fn();
const onImported = vi.fn();
const show = () => render(<BulkImportModal isOpen onClose={onClose} onImported={onImported} />);
const choose = (file: File) => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
const tabs = () => screen.getAllByRole('tab').map(t => [t.textContent, t.getAttribute('aria-selected'), t.getAttribute('aria-disabled')]);

beforeEach(() => {
  validateBulkImport.mockReset().mockResolvedValue(validation);
  executeBulkImport.mockReset().mockResolvedValue({ totalProcessed: 2, created: 1, updated: 0, skipped: 1, errors: [{ row: 3, error: 'Invalid email format' }] });
  getImportTemplate.mockReset().mockResolvedValue('username,email');
  onClose.mockReset(); onImported.mockReset();
});
afterEach(cleanup);

describe('Bulk import users', () => {
  it('opens on File, with the columns, the roles line and the drop zone', () => {
    show();
    const dialog = screen.getByRole('dialog', { name: 'Bulk import users' });
    expect(tabs()).toEqual([['File', 'true', null], ['Preview', 'false', 'true'], ['Result', 'false', 'true']]);
    expect(within(dialog).getByText('username, email, full_name, password, role, is_active')).toBeTruthy();
    expect(within(dialog).getByText('Roles: Admin, Engineer, Operator, Viewer.')).toBeTruthy();
    expect(within(dialog).getByText('Click to choose a CSV file, or drag & drop it here')).toBeTruthy();
    expect(within(dialog).getByText('.csv · up to 5000 rows')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Download template' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the file checks word for word', async () => {
    show();
    choose(csvFile('users.txt', CSV));
    expect(await screen.findByText('Please choose a .csv file.')).toBeTruthy();
    choose(csvFile('users.csv', 'username,email'));
    expect(await screen.findByText('The CSV file has no data rows.')).toBeTruthy();
    const many = ['username,email', ...Array.from({ length: 5001 }, (_, i) => `u${i},u${i}@example.test`)].join('\n');
    choose(csvFile('users.csv', many));
    expect(await screen.findByText('Maximum 5000 rows per import.')).toBeTruthy();
    expect(validateBulkImport).not.toHaveBeenCalled();
  });

  it('validates the rows first, then shows the counts in one line, the options and the rows', async () => {
    show();
    choose(csvFile('users.csv', CSV));
    await waitFor(() => expect(validateBulkImport).toHaveBeenCalledTimes(1));
    expect(validateBulkImport.mock.calls[0][0]).toEqual([
      { username: 'j_engineer', email: 'engineer.j@example.test', full_name: 'J. Engineer', password: 'Passw0rdX', role: 'Engineer', is_active: 'true' },
      { username: 'm', email: 'not-an-address', full_name: '', password: 'Passw0rdX', role: 'Viewer', is_active: 'true' },
    ]);
    const counts = await screen.findByTestId('bulk-counts');
    expect(counts.textContent).toBe('2 Total1 Valid0 Warnings0 Duplicates1 Errors');
    expect((screen.getByRole('checkbox', { name: 'Skip error rows' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Overwrite existing (duplicates)' }) as HTMLInputElement).checked).toBe(false);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['#', 'Status', 'Username', 'Email', 'Role', 'Notes']);
    expect(within(table).getAllByRole('row')[2].textContent).toContain('✕error');
    expect(within(table).getAllByRole('row')[2].textContent).toContain('Invalid email format');
  });

  it('imports with the chosen options and shows the result', async () => {
    show();
    choose(csvFile('users.csv', CSV));
    await screen.findByTestId('bulk-counts');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Overwrite existing (duplicates)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import users' }));
    await waitFor(() => expect(executeBulkImport).toHaveBeenCalledWith(validateBulkImport.mock.calls[0][0], { skipErrors: true, overwriteDuplicates: true }));
    expect((await screen.findByTestId('bulk-result')).textContent).toBe('2 Processed1 Created0 Updated1 Skipped');
    expect(screen.getByText('Row 3: Invalid email format')).toBeTruthy();
    expect(onImported).toHaveBeenCalled();
    expect(tabs()[2]).toEqual(['Result', 'true', null]);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says why Import users is off when every row has an error', async () => {
    validateBulkImport.mockResolvedValue({ ...validation, validRows: 0, errorRows: 2 });
    show();
    choose(csvFile('users.csv', CSV));
    await screen.findByTestId('bulk-counts');
    expect((screen.getByRole('button', { name: 'Import users' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Every row has an error.')).toBeTruthy();
  });

  it('goes back to File from Preview to choose another file', async () => {
    show();
    choose(csvFile('users.csv', CSV));
    await screen.findByTestId('bulk-counts');
    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    expect(tabs()[0]).toEqual(['File', 'true', null]);
    expect(screen.getByText('Click to choose a CSV file, or drag & drop it here')).toBeTruthy();
  });

  it('shows a server refusal as the server words it', async () => {
    executeBulkImport.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 409, data: { error: 'You cannot change your own role.' } } }));
    show();
    choose(csvFile('users.csv', CSV));
    await screen.findByTestId('bulk-counts');
    fireEvent.click(screen.getByRole('button', { name: 'Import users' }));
    expect((await screen.findByRole('alert')).textContent).toBe('You cannot change your own role.');
  });
});
