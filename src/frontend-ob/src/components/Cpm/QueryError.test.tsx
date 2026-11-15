// @vitest-environment jsdom
// CHG-203 (task-19 shared item 6): the shared QueryError printed the error's own message, which is the server's detail whenever
// one is sent (a class name, a table, a stack line), on every page. It now says what happened in plain words, by the answer's
// status; the server's text goes to the console only. Retry stays.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../api/apiFetch';
import { QueryError } from './shared';
import { queryErrorCopy } from './queryErrorCopy';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));

const SERVER = 'Npgsql.PostgresException: 42P01: relation "cpm.loop_registry" does not exist';
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { cleanup(); warn.mockRestore(); });

const show = (error: unknown, retry?: () => void) =>
  render(<MemoryRouter><QueryError title="Loops could not be read" error={error} retry={retry} /></MemoryRouter>);

describe('QueryError', () => {
  it.each([
    [403, 'You do not have permission to see this.'],
    [404, 'Not found.'],
    [500, 'The service did not answer. Try again.'],
    [502, 'The service did not answer. Try again.'],
    [503, 'The service did not answer. Try again.'],
    [504, 'The service did not answer. Try again.'],
    [408, 'The service did not answer. Try again.'],
    [400, 'This could not be loaded. Try again.'],
    [401, 'This could not be loaded. Try again.'],
    [409, 'This could not be loaded. Try again.'],
  ])('a %i answer reads in plain words, never the server text', (status, words) => {
    show(new ApiError(status, SERVER, SERVER));
    expect(screen.getByText(words)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Npgsql');
  });

  it('no answer at all (the network, a timeout) reads as the service not answering', () => {
    expect(queryErrorCopy(new TypeError('Failed to fetch'))).toBe('The service did not answer. Try again.');
    expect(queryErrorCopy(new TypeError('NetworkError when attempting to fetch resource.'))).toBe('The service did not answer. Try again.');
    expect(queryErrorCopy(Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }))).toBe('The service did not answer. Try again.');
  });

  it('anything else reads the general words, whatever its message', () => {
    expect(queryErrorCopy(new Error(SERVER))).toBe('This could not be loaded. Try again.');
    expect(queryErrorCopy(new TypeError("Cannot read properties of undefined (reading 'loops')"))).toBe('This could not be loaded. Try again.');
    expect(queryErrorCopy('boom')).toBe('This could not be loaded. Try again.');
    expect(queryErrorCopy(undefined)).toBe('This could not be loaded. Try again.');
  });

  it('keeps the title and Retry', () => {
    const retry = vi.fn();
    show(new ApiError(500, SERVER, SERVER), retry);
    expect(screen.getByRole('heading', { name: 'Loops could not be read' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('sends the server text to the console only', () => {
    const error = new ApiError(500, SERVER, SERVER);
    show(error);
    expect(warn).toHaveBeenCalledWith('Loops could not be read', error);
    expect(document.body.textContent).not.toContain(SERVER);
  });
});
