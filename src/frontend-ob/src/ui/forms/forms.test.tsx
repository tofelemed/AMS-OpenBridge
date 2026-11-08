import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CollapsibleSection } from '../../components/Cpm/CollapsibleSection';
import { SegmentedControl } from '../SegmentedControl';
import { Tabs } from '../Tabs';
import { Accordion } from './Accordion';
import { Checkbox } from './Checkbox';
import { FilterChip } from './FilterChip';
import { InputChip } from './InputChip';
import { Pagination, pageWindow } from './Pagination';
import { Select } from './Select';
import { TextInput } from './TextInput';

afterEach(cleanup);

const described = (el: Element) => (el.getAttribute('aria-describedby') ?? '').split(' ')
  .map(id => document.getElementById(id)?.textContent).join(' | ');

describe('TextInput', () => {
  it('is named by its visible label, or by the label alone when it is hidden', () => {
    render(<TextInput label="Find loop" value="" onChange={() => {}} />);
    expect((screen.getByLabelText('Find loop') as HTMLInputElement).type).toBe('text');
    cleanup();
    render(<TextInput label="Role description" hideLabel value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Role description' })).toBeTruthy();
    expect(document.querySelector('label')).toBeNull();
  });

  it('follows each keystroke with onChange and the committed value with onCommit', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<TextInput label="Note" value="a" onChange={onChange} onCommit={onCommit} />);
    const input = screen.getByLabelText('Note');
    fireEvent.input(input, { target: { value: 'ab' } });
    expect(onChange.mock.calls).toEqual([['ab']]);
    expect(onCommit).not.toHaveBeenCalled();
    (input as HTMLInputElement).value = 'abc';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onCommit.mock.calls).toEqual([['abc']]);
  });

  it('clears through a named button that only shows while there is a value, and returns focus', () => {
    const Clearable: React.FC<{ onCommit: (v: string) => void }> = ({ onCommit }) => {
      const [v, setV] = useState('FIC');
      return <TextInput label="Filter" clearable value={v} onChange={setV} onCommit={onCommit} />;
    };
    const onCommit = vi.fn();
    render(<Clearable onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filter' }));
    expect((screen.getByLabelText('Filter') as HTMLInputElement).value).toBe('');
    expect(onCommit.mock.calls).toEqual([['']]);
    expect(screen.queryByRole('button', { name: 'Clear Filter' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Filter'));
  });

  it('states helper text and an invalid message on the input', () => {
    render(<TextInput label="Tag" value="" onChange={() => {}} helper="Plant tag" error="A tag is required." />);
    const input = screen.getByLabelText('Tag');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(described(input)).toBe('Plant tag | A tag is required.');
    expect(screen.getByRole('alert').textContent).toBe('A tag is required.');
  });

  it('gives its reason when disabled and offers no clear button', () => {
    render(<TextInput label="Tag" value="x" clearable onChange={() => {}} disabled reason="Needs cpm.manage" />);
    const input = screen.getByLabelText('Tag') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(described(input)).toBe('Needs cpm.manage');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Select', () => {
  const OPTIONS = [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }] as const;

  it('is named when its label is hidden and hands back the plain value', () => {
    const onChange = vi.fn();
    render(<Select label="Opportunity ranking" hideLabel options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Opportunity ranking' }), { target: { value: 'b' } });
    expect(onChange.mock.calls).toEqual([['b']]);
  });

  it('states an invalid message and a disabled reason', () => {
    render(<Select label="Rank" options={OPTIONS} value="a" onChange={() => {}} error="Pick one." disabled reason="Read only" />);
    const select = screen.getByLabelText('Rank') as HTMLSelectElement;
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.disabled).toBe(true);
    expect(described(select)).toBe('Pick one. | Read only');
  });
});

describe('Checkbox', () => {
  it('is named by its label and hands back the next state', () => {
    const onChange = vi.fn();
    render(<Checkbox label="cpm.manage" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'cpm.manage' }));
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('gives its reason when disabled', () => {
    render(<Checkbox label="cpm.manage" checked onChange={() => {}} disabled reason="System role" />);
    const box = screen.getByRole('checkbox', { name: 'cpm.manage' }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(described(box)).toBe('System role');
  });
});

describe('Accordion', () => {
  it('is a native details the caller opens and closes', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Accordion label="Identity" open={false} onToggle={onToggle}>body</Accordion>);
    const details = document.querySelector('details')!;
    const summary = screen.getByText('Identity').closest('summary')!;
    fireEvent.click(summary);
    expect(onToggle.mock.calls).toEqual([[true]]);
    expect(details.open).toBe(false);
    rerender(<Accordion label="Identity" open onToggle={onToggle}>body</Accordion>);
    expect(details.open).toBe(true);
    fireEvent.click(summary);
    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });

  it('does not open while disabled and says why', () => {
    const onToggle = vi.fn();
    render(<Accordion label="Identity" open={false} onToggle={onToggle} disabled reason="No run selected">body</Accordion>);
    const summary = screen.getByText('Identity').closest('summary')!;
    fireEvent.click(summary);
    expect(onToggle).not.toHaveBeenCalled();
    expect(summary.getAttribute('aria-disabled')).toBe('true');
    expect(described(summary)).toBe('No run selected');
  });
});

describe('CollapsibleSection on the Accordion', () => {
  beforeEach(() => localStorage.clear());

  it('renders its content only while open and remembers only a choice the user made', () => {
    render(<CollapsibleSection id="s1" title="Method" summary="One line" defaultOpen><span>inside</span></CollapsibleSection>);
    expect(screen.getByText('inside')).toBeTruthy();
    expect(localStorage.getItem('ams-cpm-section:s1')).toBeNull();
    fireEvent.click(screen.getByText('Method').closest('summary')!);
    expect(screen.queryByText('inside')).toBeNull();
    expect(screen.getByText('One line')).toBeTruthy();
    expect(localStorage.getItem('ams-cpm-section:s1')).toBe('false');
  });
});

describe('FilterChip', () => {
  it('is a toggle whose selected state is a mark as well as a colour', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FilterChip label="Bad PV" selected={false} onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: 'Bad PV' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(chip.querySelector('.ui-icon')).toBeNull();
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<FilterChip label="Bad PV" selected onToggle={onToggle} />);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.querySelector('.ui-icon')).toBeTruthy();
  });

  it('stays focusable while disabled, does nothing and says why', () => {
    const onToggle = vi.fn();
    render(<FilterChip label="Bad PV" selected={false} onToggle={onToggle} disabled reason="No health data" />);
    const chip = screen.getByRole('button', { name: 'Bad PV' });
    fireEvent.click(chip);
    expect(onToggle).not.toHaveBeenCalled();
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.hasAttribute('disabled')).toBe(false);
    expect(described(chip)).toBe('No health data');
  });
});

describe('InputChip', () => {
  it('is named "Remove <label>" and removes on activation', () => {
    const onRemove = vi.fn();
    render(<InputChip label="Loop FIC101" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Loop FIC101' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not remove while disabled and says why', () => {
    const onRemove = vi.fn();
    render(<InputChip label="Stale" onRemove={onRemove} disabled reason="Fixed by the page" />);
    const chip = screen.getByRole('button', { name: 'Remove Stale' });
    fireEvent.click(chip);
    expect(onRemove).not.toHaveBeenCalled();
    expect(described(chip)).toBe('Fixed by the page');
  });
});

describe('Pagination', () => {
  const names = ['First page', 'Previous page', 'Next page', 'Last page'];

  it('has four named controls, numbered jumps and one status line', () => {
    render(<Pagination page={4} pageCount={50} onChange={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(nav).getAllByRole('button').map(b => b.getAttribute('aria-label')).filter(Boolean)).toEqual(names);
    expect(nav.querySelector('.ui-pagination__status')?.textContent).toBe('Page 4 of 50');
  });

  it('moves to the first, previous, next and last page', () => {
    const onChange = vi.fn();
    render(<Pagination page={4} pageCount={50} onChange={onChange} />);
    names.forEach(name => fireEvent.click(screen.getByRole('button', { name })));
    expect(onChange.mock.calls).toEqual([[1], [3], [5], [50]]);
  });

  it('keeps an end button focusable but inert, with the status line as its reason', () => {
    const onChange = vi.fn();
    render(<Pagination page={5} pageCount={5} onChange={onChange} />);
    const next = screen.getByRole('button', { name: 'Next page' });
    fireEvent.click(next);
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.hasAttribute('disabled')).toBe(false);
    expect(described(next)).toBe('Page 5 of 5');
    expect(screen.getByRole('button', { name: 'First page' }).getAttribute('aria-disabled')).toBeNull();
  });
});

describe('SegmentedControl options added for the replacements', () => {
  const OPTIONS = [
    { value: 'a', label: 'One' },
    { value: 'b', label: 'Two', disabled: true, reason: 'Nothing registered' },
    { value: 'c', label: <>Three <span>7</span></> },
  ];

  it('marks a disabled option, ignores it and states its reason', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Pick" options={OPTIONS} value="a" onChange={onChange} />);
    const two = screen.getByRole('button', { name: 'Two' });
    fireEvent.click(two);
    expect(onChange).not.toHaveBeenCalled();
    expect(two.getAttribute('aria-disabled')).toBe('true');
    expect(described(two)).toBe('Nothing registered');
    expect(screen.getByRole('button', { name: 'Three 7' })).toBeTruthy();
  });

  it('passes over a disabled option with the arrow keys', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Pick" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'One' }), { key: 'ArrowRight' });
    expect(onChange.mock.calls).toEqual([['c']]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Three 7' }));
  });

  it('stays quiet on the selected option only when asked to', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SegmentedControl label="Pick" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    expect(onChange.mock.calls).toEqual([['a']]);
    rerender(<SegmentedControl label="Pick" options={OPTIONS} value="a" onChange={onChange} ignoreReselect />);
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Tabs count badge', () => {
  it('shows a count, zero included, and nothing without one', () => {
    const options = [{ value: 'a', label: 'Summary' }, { value: 'b', label: 'Signals', badge: 3 }, { value: 'c', label: 'Links', badge: 0 }];
    render(<Tabs idBase="b" label="Loop" options={options} value="a" onChange={() => {}} />);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Summary', 'Signals3', 'Links0']);
  });
});

describe('Pagination page jumps', () => {
  it('offers the ends and the pages around the current one', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(10, 50)).toEqual([1, null, 8, 9, 10, 11, 12, null, 50]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  it('jumps to a numbered page and marks the current one', () => {
    const onChange = vi.fn();
    render(<Pagination page={2} pageCount={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    expect(onChange).toHaveBeenCalledWith(4);
    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page');
  });
});

describe('Pagination size (CHG-156)', () => {
  it('draws its buttons 32 px square, smaller than the 40 px controls, from tokens', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync(`${process.cwd()}/src/ui/forms/forms.css`, 'utf8');
    expect(css).toMatch(/\.ui-pagination \.ui-control \{[^}]*height: var\(--traverse-space-8\)/);
    expect(css).toMatch(/\.ui-pagination \.ui-control--icon \{[^}]*width: var\(--traverse-space-8\)/);
  });
});
