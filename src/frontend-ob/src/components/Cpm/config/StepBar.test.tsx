import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StepBar } from './StepBar';
import { stepMarks } from './levelWords';

const marks = { edit: 'done', check: 'current', try: null, approve: null, deploy: null } as const;
afterEach(cleanup);

describe('StepBar', () => {
  it('renders five step buttons in order and reports the clicked one', () => {
    const onStep = vi.fn();
    render(<MemoryRouter><StepBar current="check" marks={marks} onStep={onStep} /></MemoryRouter>);
    const btns = screen.getAllByRole('button');
    expect(btns.map(b => b.textContent)).toEqual(['✓Edit, done', '2Check, in progress', '3Try on past dataoptional, not started', '4Approve, not started', '5Deploy, not started']);
    expect(btns[1].getAttribute('aria-current')).toBe('step');
    fireEvent.click(btns[3]);
    expect(onStep).toHaveBeenCalledWith('approve');
  });
  it('puts a step help after its label, inside that step and outside its button', () => {
    render(<MemoryRouter><StepBar current="check" marks={marks} onStep={() => {}} help={{ approve: <p>Why approve</p> }} /></MemoryRouter>);
    const li = screen.getByText('Approve').closest('li')!;
    const stepBtn = li.querySelector('.cpm-config-step__btn')!;
    const others = Array.from(li.querySelectorAll('button')).filter(b => b !== stepBtn);
    expect(others).toHaveLength(1);
    expect(stepBtn.contains(others[0])).toBe(false);
    expect(stepBtn.compareDocumentPosition(others[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('names the state in the accessible name', () => {
    render(<MemoryRouter><StepBar current="check" marks={stepMarks('SHADOW_EVALUATED')} onStep={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Edit.*done/ })).toBeTruthy();
  });
  it('rings only the step being viewed, even when done', () => {
    const { container } = render(<MemoryRouter><StepBar current="edit" marks={stepMarks('SHADOW_EVALUATED')} onStep={() => {}} /></MemoryRouter>);
    const edit = screen.getByRole('button', { name: /Edit/ }).closest('li')!;
    const tryStep = screen.getByRole('button', { name: /Try on past data/ }).closest('li')!;
    expect(edit.className).toContain('cpm-config-step--done');
    expect(edit.className).toContain('cpm-config-step--viewed');
    expect(screen.getByRole('button', { name: /Edit/ }).getAttribute('aria-current')).toBe('step');
    expect(tryStep.className).not.toContain('cpm-config-step--viewed');
    expect(container.querySelectorAll('.cpm-config-step--viewed')).toHaveLength(1);
  });
});
