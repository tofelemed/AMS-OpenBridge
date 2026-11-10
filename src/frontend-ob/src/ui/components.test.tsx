import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../api/cpmApi';
import { AssetPicker, readRecentLoops, rememberLoop } from './AssetPicker';
import { ContextHeader } from './ContextHeader';
import { DataState } from './DataState';
import { DataTable, type Column, type SortState } from './DataTable';
import { Dialog } from './Dialog';
import { Inspector } from './Inspector';
import { MetricSummary } from './MetricSummary';
import { NE107_LABEL, Ne107Badge, StatusBadge } from './StatusBadge';
import { GateBadge, GateKey, gateBadgeTone } from './GateBadge';
import { diagnosisTone, episodeTone, jobTone, qualityTone, registryTone } from './statusTones';

afterEach(cleanup);

describe('StatusBadge', () => {
  it.each(['danger', 'warning', 'success', 'info', 'unknown', 'neutral'] as const)('%s always has a glyph and text', tone => {
    const { container } = render(<StatusBadge tone={tone}>Label</StatusBadge>);
    expect(container.querySelector('.ui-badge__glyph')?.textContent).toBeTruthy();
    expect(container.textContent).toContain('Label');
  });

  it('hides the glyph from assistive technology, so the label alone is read', () => {
    const { container } = render(<StatusBadge tone="danger">Failed</StatusBadge>);
    expect(container.querySelector('.ui-badge__glyph')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the field caption', () => {
    render(<StatusBadge tone="neutral" caption="Signal quality">Good</StatusBadge>);
    expect(screen.getByText('Signal quality')).toBeTruthy();
  });

  it.each(Object.entries(NE107_LABEL))('NE107 %s shows its code and label together', (code, label) => {
    const { container } = render(<Ne107Badge code={code as 'F'} />);
    expect(container.textContent).toBe(`${code}${label}`);
  });
});

describe('CD8 tones', () => {
  it.each([['Suspected oscillation', 'info'], ['DETECTED', 'info'], ['CLASSIFIED', 'info'], ['CONFIRMED_STICTION', 'warning'], ['RULED_OUT', 'neutral'], ['NO_CALL', 'unknown']])('diagnosis %s is %s', (v, tone) => {
    expect(diagnosisTone(v).tone).toBe(tone);
  });

  it.each([['unacknowledged', 'warning'], ['acknowledged', 'info'], ['shelved', 'neutral'], ['shelf expired', 'warning']])('episode %s is %s', (v, tone) => {
    expect(episodeTone(v).tone).toBe(tone);
  });

  it('keeps good quality neutral until it ages', () => {
    expect(qualityTone('GOOD').tone).toBe('neutral');
    expect(qualityTone('GOOD', true).tone).toBe('warning');
  });

  it.each([['BAD', 'danger'], ['UNCERTAIN', 'warning'], ['MAINT', 'warning'], ['OOS', 'unknown']])('quality %s is %s', (v, tone) => {
    expect(qualityTone(v).tone).toBe(tone);
  });

  it.each([['queued', 'unknown'], ['running', 'info'], ['completed', 'success'], ['failed', 'danger'], ['ACTIVE_VERIFIED', 'success']])('job %s is %s', (v, tone) => {
    expect(jobTone(v).tone).toBe(tone);
  });

  it('marks registry states', () => {
    expect(registryTone('Active').tone).toBe('info');
    expect(registryTone('Degraded').tone).toBe('warning');
  });

  it('gives a diagnosis the same symbol as the gate that reached it', () => {
    expect(diagnosisTone('CONFIRMED_STICTION').glyph).toBe('▲');
    expect(diagnosisTone('SUSPECTED').glyph).toBe('△');
    expect(diagnosisTone('DETECTED').glyph).toBe('△');
    expect(diagnosisTone('RULED_OUT').glyph).toBe('◇');
  });

  it('never makes an unrecognised value look healthy', () => {
    for (const fn of [diagnosisTone, episodeTone, qualityTone, jobTone, registryTone]) {
      expect(fn('SOMETHING_NEW').tone).toBe('unknown');
    }
  });
});

describe('GateBadge: one symbol per meaning, everywhere', () => {
  const mark = (status: string, gate?: string) => {
    const { container, unmount } = render(<GateBadge status={status} gate={gate} />);
    const out = { glyph: container.querySelector('.ui-badge__glyph')?.textContent, text: container.textContent, className: container.querySelector('.ui-badge')?.className };
    unmount();
    return out;
  };

  it.each([
    ['PASS', 'G0', '✓', 'Pass'],
    ['WARN', 'G3', '!', 'Attention'],
    ['FAIL', 'G3', '✕', 'Failed'],
    ['FAIL', 'G0', '⊘', 'Not usable'],
    ['EXCLUDED_MODE', 'G3', '⊖', 'Excluded'],
    ['PASS', 'G7', '◯', 'Not seen'],
    ['WARN', 'G7', '◐', 'Symptom seen'],
    ['STRONG', 'G7', '⬤', 'Strong symptom'],
    ['SUSPECTED', 'G15', '△', 'Suspected'],
    ['CONFIRMED', 'G15', '▲', 'Confirmed'],
    ['CONTRADICTED', 'G15', '◇', 'Ruled out'],
    ['NOT_EVALUATED', 'G3', '—', 'Not evaluated'],
    ['NOT_APPLICABLE', 'G3', '∅', 'N/A'],
    ['PENDING', 'G3', '…', 'Pending'],
  ])('%s on %s shows %s %s', (status, gate, glyph, word) => {
    const m = mark(status, gate);
    expect(m.glyph).toBe(glyph);
    expect(m.text).toContain(word);
  });

  it('never shows a tick for a diagnostic gate, because there a pass means the symptom was not seen', () => {
    expect(mark('PASS', 'G7').glyph).not.toBe('✓');
  });

  it('gives a screen reader the full meaning', () => {
    expect(mark('PASS', 'G7').text).toContain('symptom not seen by this method');
  });

  it('follows CD8 for colour', () => {
    expect(gateBadgeTone('ok', 'good')).toBe('neutral');
    expect(gateBadgeTone('failed', 'bad')).toBe('danger');
    expect(gateBadgeTone('attention', 'warn')).toBe('warning');
    expect(gateBadgeTone('none', 'muted')).toBe('unknown');
    expect(gateBadgeTone('confirmed', 'bad')).toBe('warning');
    expect(gateBadgeTone('suspected', 'warn')).toBe('info');
    expect(gateBadgeTone('excluded', 'muted')).toBe('neutral');
  });

  it('keys every mark in the legend', () => {
    const { container } = render(<GateKey />);
    expect(container.textContent).toContain('symptom seen');
    expect(container.textContent).toContain('excluded on purpose');
  });
});

describe('ContextHeader', () => {
  it('has one heading, a breadcrumb and no purpose sentence slot', () => {
    render(<MemoryRouter><ContextHeader title="Overview" identity="All sites" /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'CPA' })).toBeTruthy();
    expect(within(crumbs).getByText('Overview').getAttribute('aria-current')).toBe('page');
  });

  it('keeps context on the breadcrumb link', () => {
    render(<MemoryRouter initialEntries={['/cpm/loop?site=hdpe&range=7d']}><ContextHeader title="Loop" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'CPA' }).getAttribute('href')).toBe('/cpm?site=hdpe&range=7d');
  });
});

describe('MetricSummary', () => {
  it('shows value, unit, window and definition slot', () => {
    render(<MetricSummary label="Fleet" metrics={[{ key: 'a', label: 'Time in normal mode', value: '98.2', unit: '%', window: '12 h window', help: <button type="button">About</button> }]} />);
    expect(screen.getByText('98.2')).toBeTruthy();
    expect(screen.getByText('12 h window')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About' })).toBeTruthy();
  });

  it('shows a real zero as zero', () => {
    render(<MetricSummary label="Fleet" metrics={[{ key: 'a', label: 'Oscillating', value: 0 }]} />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText('Unavailable')).toBeNull();
  });

  it('never turns a missing value into a number', () => {
    render(<MetricSummary label="Fleet" metrics={[{ key: 'a', label: 'PV', value: null, note: 'No signal mapped' }]} />);
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('No signal mapped')).toBeTruthy();
  });

  it('keeps a stale value and says Stale', () => {
    render(<MetricSummary label="Fleet" metrics={[{ key: 'a', label: 'PV', value: '41.2', state: 'stale', note: 'No data since 13:15 GST' }]} />);
    expect(screen.getByText('41.2')).toBeTruthy();
    expect(screen.getByText('Stale')).toBeTruthy();
  });
});

describe('DataState', () => {
  it('labels loading for assistive technology', () => {
    render(<DataState kind="loading" label="Loading loops" />);
    expect(screen.getByRole('status').textContent).toBe('Loading loops');
  });

  it('gives an error text even when the failure has none', () => {
    render(<DataState kind="error" error={new Error('   ')} />);
    expect(screen.getByRole('alert').textContent).toContain('The service did not respond.');
  });

  it('shows the error message and retries', () => {
    const retry = vi.fn();
    render(<DataState kind="error" error={new Error('Historian timed out')} onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('Historian timed out');
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('separates filtered-empty from empty', () => {
    const { rerender } = render(<DataState kind="empty" />);
    expect(screen.getByText('No records')).toBeTruthy();
    rerender(<DataState kind="filtered-empty" onReset={() => undefined} />);
    expect(screen.getByText('No records match these filters')).toBeTruthy();
    expect(screen.getByText('Reset filters')).toBeTruthy();
  });

  it('keeps the retained value visible under a stale notice', () => {
    render(<DataState kind="stale" reason="No data since 13:15 GST"><p>41.2</p></DataState>);
    expect(screen.getByText('41.2')).toBeTruthy();
    expect(screen.getByText('No data since 13:15 GST')).toBeTruthy();
  });

  it.each(['partial', 'bad-quality', 'unavailable', 'restricted'] as const)('%s has a title', kind => {
    render(<DataState kind={kind} />);
    expect(screen.getByTestId(`state-${kind}`).textContent).toBeTruthy();
  });
});

describe('DataTable', () => {
  interface Row { id: string; value: number }
  const ROWS: Row[] = [{ id: 'A', value: 1 }, { id: 'B', value: 2 }];
  const COLUMNS: Array<Column<Row>> = [
    { key: 'id', header: 'Tag', cell: r => r.id, sortable: true, mono: true },
    { key: 'value', header: 'Value', cell: r => r.value, align: 'end' },
  ];

  const Table: React.FC<{ rows?: Row[] }> = ({ rows = ROWS }) => {
    const [sort, setSort] = useState<SortState>(null);
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <DataTable
        caption="Loops" columns={COLUMNS} rows={rows} rowKey={r => r.id} sort={sort}
        onSort={key => setSort({ key, dir: sort?.dir === 'asc' ? 'desc' : 'asc' })}
        selectedKey={selected} onSelect={r => setSelected(r.id)}
      />
    );
  };

  it('uses native table semantics and names the table', () => {
    render(<Table />);
    expect(screen.getByRole('table', { name: 'Loops' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Tag/ })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('reports the sort on the heading', () => {
    render(<Table />);
    const head = screen.getByRole('columnheader', { name: /Tag/ });
    expect(head.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(within(head).getByRole('button'));
    expect(head.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(within(head).getByRole('button'));
    expect(head.getAttribute('aria-sort')).toBe('descending');
  });

  it('selects with Enter and moves with the arrows', () => {
    render(<Table />);
    const [, first, second] = screen.getAllByRole('row');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(second.getAttribute('aria-current')).toBe('true');
  });

  it('keeps its scroll region reachable by keyboard', () => {
    render(<Table />);
    expect(screen.getByRole('region', { name: 'Loops' }).getAttribute('tabindex')).toBe('0');
  });

  it('renders an empty, a filtered-empty, an error and a loading state inside the table region', () => {
    const base = { caption: 'Loops', columns: COLUMNS, rows: [] as Row[], rowKey: (r: Row) => r.id };
    const { rerender } = render(<DataTable {...base} emptyTitle="No loops" />);
    expect(screen.getByText('No loops')).toBeTruthy();
    rerender(<DataTable {...base} filtered onResetFilters={() => undefined} />);
    expect(screen.getByText('Reset filters')).toBeTruthy();
    rerender(<DataTable {...base} error={new Error('Service down')} />);
    expect(screen.getByRole('alert').textContent).toContain('Service down');
    rerender(<DataTable {...base} loading />);
    expect(screen.getByRole('status').textContent).toContain('Loading Loops');
  });
});

describe('Dialog', () => {
  const Host: React.FC = () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Shelve" description="For how long" footer={<button type="button">Save</button>}>
          <input aria-label="Reason" />
        </Dialog>
      </>
    );
  };

  it('is a named modal dialog with its description linked', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Shelve' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('closes on Escape, by its named close control, and returns focus', () => {
    render(<Host />);
    const open = screen.getByRole('button', { name: 'Open' });
    open.focus();
    fireEvent.click(open);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Inspector', () => {
  const setWidth = (narrow: boolean) => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: narrow && q.includes('1279'), addEventListener: () => undefined, removeEventListener: () => undefined }));
  };

  afterEach(() => vi.unstubAllGlobals());

  it('stays beside the main view on a wide screen, even when closed', () => {
    setWidth(false);
    render(<Inspector title="Loop" open={false} onClose={() => undefined} primaryAction={<button type="button">Act</button>}>Detail</Inspector>);
    expect(screen.getByRole('complementary', { name: 'Loop' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('becomes a modal drawer below 1280 px, shown only while open', () => {
    setWidth(true);
    const { rerender } = render(<Inspector title="Loop" open={false} onClose={() => undefined}>Detail</Inspector>);
    expect(screen.queryByText('Detail')).toBeNull();
    rerender(<Inspector title="Loop" open onClose={() => undefined}>Detail</Inspector>);
    expect(screen.getByRole('dialog', { name: 'Loop' }).getAttribute('aria-modal')).toBe('true');
  });

  it('closes the drawer on Escape', () => {
    setWidth(true);
    const close = vi.fn();
    render(<Inspector title="Loop" open onClose={close}>Detail</Inspector>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalled();
  });
});

describe('AssetPicker', () => {
  const loop = (id: string, name: string): CpmLoop => ({ loopId: id, displayName: name, site: 'hdpe', area: 's1', unit: 'u1', loopType: 'FIC' }) as CpmLoop;
  const LOOPS = [loop('FIC1', 'Reactor feed flow'), loop('TIC2', 'Jacket temperature'), loop('LIC3', 'Drum level')];

  beforeEach(() => localStorage.clear());

  it('searches by tag and by description', () => {
    render(<AssetPicker loops={LOOPS} value="" onSelect={() => undefined} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'jacket' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'FIC1' } });
    expect(screen.getByRole('option').textContent).toContain('FIC1');
  });

  it('selects with the keyboard and remembers the loop', () => {
    const select = vi.fn();
    render(<AssetPicker loops={LOOPS} value="" onSelect={select} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith('TIC2');
    expect(readRecentLoops()).toEqual(['TIC2']);
  });

  it('lists recent loops first and labels them', () => {
    rememberLoop('LIC3');
    render(<AssetPicker loops={LOOPS} value="" onSelect={() => undefined} />);
    fireEvent.focus(screen.getByRole('combobox'));
    const first = screen.getAllByRole('option')[0];
    expect(first.textContent).toContain('LIC3');
    expect(first.textContent).toContain('Recent');
  });

  it('says so when nothing matches, and closes on Escape', () => {
    render(<AssetPicker loops={LOOPS} value="" onSelect={() => undefined} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText('No loop matches in this scope.')).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('caps the recent list at five, newest first', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) rememberLoop(id);
    expect(readRecentLoops()).toEqual(['f', 'e', 'd', 'c', 'b']);
  });
});
