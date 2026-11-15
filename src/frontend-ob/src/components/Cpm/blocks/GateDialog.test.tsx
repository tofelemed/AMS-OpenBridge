// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GateActions, GateDialog, gateWindowLine } from './GateDialog';
import { fmtDateTime } from '../shared';

afterEach(cleanup);

const base = { open: true, onClose: () => {}, loop: 'FIC10301', gate: 'G5', status: 'WARN', loopResult: 'Oscillation confirmed', windowLine: '12h window · a → b', actions: <button>Review FIC10301 →</button> };

describe('GateDialog', () => {
  // CHG-200 (final test #21, the dialog standard): the gate and its name as the title, the loop as the subtitle on the band
  it('titles the dialog with the gate and its name, the loop under it, and shows the status, result and window', () => {
    render(<GateDialog {...base} />);
    const dialog = screen.getByRole('dialog', { name: 'G5 · Oscillation (ACF)' });
    expect(dialog.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC10301');
    expect(within(dialog).getAllByText(/Oscillation \(ACF\)/)).toHaveLength(1);
    expect(within(dialog).getByText('Symptom seen')).toBeTruthy();
    expect(within(dialog).getByText('Oscillation confirmed')).toBeTruthy();
    expect(within(dialog).getByText('12h window · a → b')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Review FIC10301 →' })).toBeTruthy();
  });

  it('CHG-191: has no caps tier label and no Assessment row; the window is one line', () => {
    render(<GateDialog {...base} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Diagnostic evidence')).toBeNull();
    expect(dialog.querySelector('.cpm-eyebrow')).toBeNull();
    expect(within(dialog).queryByText('Assessment')).toBeNull();
    expect(dialog.querySelectorAll('.cpm-gate-dialog__window')).toHaveLength(1);
  });

  it('CHG-191: with an aside it is wide, the result in the first column and the aside in the second', () => {
    render(<GateDialog {...base} aside={<p>what it asks</p>} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('ui-dialog--wide');
    const cols = dialog.querySelectorAll('.cpm-gate-dialog__cols > .cpm-gate-dialog__col');
    expect(cols).toHaveLength(2);
    expect(cols[0].textContent).toContain('Check status');
    expect(cols[0].textContent).toContain('12h window · a → b');
    expect(cols[1].textContent).toBe('what it asks');
  });

  it('keeps the default width and one column without an aside (Investigation)', () => {
    render(<GateDialog {...base} loopInView />);
    const dialog = screen.getByRole('dialog', { name: 'G5 · Oscillation (ACF)' });
    expect(dialog.className).toContain('ui-dialog--default');
    expect(dialog.querySelector('.cpm-gate-dialog__cols')).toBeNull();
    expect(within(dialog).queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('uses the same word as the cell, through gateMark', () => {
    render(<GateDialog {...base} gate="G5" status="PASS" />);
    expect(screen.getByText('Not seen')).toBeTruthy();
  });

  it('says what was missing on a pass judged without an input', () => {
    render(<GateDialog {...base} gate="G4" status="PASS" rows={[{ label: 'Reason', value: 'No OP limits' }]} />);
    expect(screen.getByText('Reason')).toBeTruthy();
    expect(screen.getByText('No OP limits')).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    render(<GateDialog {...base} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<GateDialog {...base} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('sits outside the page, so a sticky band cannot clip it', () => {
    const { container } = render(<div><GateDialog {...base} /></div>);
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(document.body.querySelector('[role=dialog]')).toBeTruthy();
  });
});

describe('gateWindowLine (CHG-191)', () => {
  it('joins the kind and both bounds, each printed exactly as the app prints a time', () => {
    const from = '2026-11-14T07:00:00Z';
    const to = '2026-11-14T19:00:00Z';
    expect(gateWindowLine('12h', from, to)).toBe(`12h window · ${fmtDateTime(from)} → ${fmtDateTime(to)}`);
  });

  it('names only the kind when no bound is known', () => {
    expect(gateWindowLine('24h', null, undefined)).toBe('24h window');
  });
});

describe('GateActions (CHG-191)', () => {
  it('orders the foot: Prev / Next together, then the links, then the one primary', () => {
    render(
      <GateActions
        steps={<><button>Prev</button><button>Next</button></>}
        links={<><button>Replay ↗</button><button>Window Inspector ↗</button></>}
        primary={<button>Review →</button>} />);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Prev', 'Next', 'Replay ↗', 'Window Inspector ↗', 'Review →']);
    expect(screen.getByText('Prev').parentElement?.className).toBe('cpm-gate-actions__steps');
    expect(screen.getByText('Next').parentElement?.className).toBe('cpm-gate-actions__steps');
    expect(screen.getByText('Replay ↗').parentElement?.className).toBe('cpm-gate-actions__links');
    expect(screen.getByText('Review →').parentElement?.className).toBe('cpm-gate-actions__primary');
  });
});

describe('gate dialog layout CSS (CHG-191)', () => {
  const css = readFileSync(join(__dirname, '../../../styles/cpm-blocks.css'), 'utf8').replace(/\r\n/g, '\n');
  it('is one column, and two from a 1000 px viewport', () => {
    expect(css).toMatch(/\.cpm-gate-dialog__cols \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(min-width: 1000px\) \{\s*\.cpm-gate-dialog__cols \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  });

  it('puts the primary at the far end of the foot, after the links', () => {
    expect(css).toMatch(/\.cpm-gate-actions__primary \{ margin-inline-start: auto; \}/);
  });
});
