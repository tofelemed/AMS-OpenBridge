// @vitest-environment jsdom
// CHG-163 (owner review): a loop is named by its tag, never by its historian path, on the Raw historian stage too.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ReplayStages } from './ReplayStages';

afterEach(cleanup);

describe('ReplayStages', () => {
  it('names the raw stage without the historian path', () => {
    const { container } = render(<ReplayStages gridS={5} gateKey="G15" role="FUSION" hasVerdict diagnosis="CONFIRMED_OSCILLATION" phasePlane={false} />);
    expect(container.textContent).toContain('Raw historian samples of the window');
    expect(container.textContent).not.toMatch(/root\./);
  });
});
