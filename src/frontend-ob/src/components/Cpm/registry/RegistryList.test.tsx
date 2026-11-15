// CHG-200 (final test #26): the Registry's loop type in words; a loop the plant model gives no type reads "Unknown type", not the
// code UNKNOWN.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';
import { RegistryList } from './RegistryList';

afterEach(cleanup);
const loop = (loopId: string, loopType: string) => ({ loopId, loopType, displayName: loopId }) as unknown as CpmLoop;

describe('RegistryList', () => {
  it('names the loop type in words', () => {
    render(<MemoryRouter><RegistryList rows={[loop('FIC1', 'flow'), loop('X1', 'UNKNOWN')]} selectedId="" hrefFor={id => `/${id}`} onOpen={() => {}} /></MemoryRouter>);
    const types = screen.getAllByRole('row').slice(1).map(r => r.querySelectorAll('td')[1].textContent);
    expect(types).toEqual(['flow', 'Unknown type']);
  });
});
