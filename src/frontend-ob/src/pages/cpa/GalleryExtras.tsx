/** Gallery sections for the form controls, Toggletip, TechnicalDetails and Toast. Sample data only. */
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '../../ui/Button';
import { Accordion } from '../../ui/forms/Accordion';
import { Checkbox } from '../../ui/forms/Checkbox';
import { FilterChip } from '../../ui/forms/FilterChip';
import { InputChip } from '../../ui/forms/InputChip';
import { Pagination } from '../../ui/forms/Pagination';
import { Select } from '../../ui/forms/Select';
import { TextInput } from '../../ui/forms/TextInput';
import { TechnicalDetails } from '../../ui/TechnicalDetails';
import { Toggletip } from '../../ui/Toggletip';
import { GalleryTrend } from './GalleryTrend';

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section className="gallery__section" data-component={id} aria-label={title}>
    <h2 className="gallery__title">{title}</h2>
    <div className="gallery__body">{children}</div>
  </section>
);

const Forms: React.FC = () => {
  const [text, setText] = useState('FIC10302');
  const [choice, setChoice] = useState('a');
  const [checked, setChecked] = useState(true);
  const [chip, setChip] = useState(true);
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [chips, setChips] = useState(['Stale', 'Open']);
  const options = [{ value: 'a', label: 'Evidence score' }, { value: 'b', label: 'Control error' }];
  return (
    <>
      <div className="gallery__grid">
        <TextInput label="Loop" value={text} onChange={setText} clearable helper="Tag or description" />
        <TextInput label="Note" value="" onChange={() => undefined} error="Enter a reason" />
        <TextInput label="Read only here" value="Locked" onChange={() => undefined} disabled reason="Needs the cpm.manage permission" />
        <Select label="Order" options={options} value={choice} onChange={setChoice} />
        <Select label="Disabled order" options={options} value="a" onChange={() => undefined} disabled reason="No data to order" />
      </div>
      <div className="gallery__row">
        <Checkbox label="Acknowledge with this note" checked={checked} onChange={setChecked} />
        <Checkbox label="Unchecked option" checked={false} onChange={() => undefined} />
        <FilterChip label="Missing binding" selected={chip} onToggle={() => setChip(c => !c)} />
        <FilterChip label="Stale collection" selected={false} onToggle={() => undefined} />
        {chips.map(c => <InputChip key={c} label={c} onRemove={() => setChips(all => all.filter(x => x !== c))} />)}
      </div>
      <Accordion label="Basis and limitations" open={open} onToggle={setOpen}><p>Accordion content</p></Accordion>
      <Pagination page={page} pageCount={5} onChange={setPage} label="Sample pages" />
    </>
  );
};

export const GalleryExtras: React.FC = () => (
  <>
    <Section id="6.4" title="6.4 TrendPanel"><GalleryTrend /></Section>
    <Section id="6.7" title="6.7 Toggletip">
      <div className="gallery__row">
        <span>Monitored loops</span>
        <Toggletip metric="M-001" />
        <span>How to read this view</span>
        <Toggletip variant="how-to" label="How to read this view">
          <p>Each row is one loop. Each column is one check.</p>
        </Toggletip>
      </div>
    </Section>
    <Section id="6.10" title="6.10 Form controls"><Forms /></Section>
    <Section id="6.13" title="6.13 TechnicalDetails">
      <TechnicalDetails items={[
        { label: 'Method run', value: '276279a3-e8d2-570c-b50f-5569c01dff63', mono: true },
        { label: 'Historian path', value: 'root.sample.cpm.FIC10302', mono: true },
        { label: 'Engine version', value: null },
      ]} />
    </Section>
    <Section id="6.16" title="6.16 Toast">
      <div className="gallery__row">
        <Button onClick={() => toast.success('Saved')}>Success toast</Button>
        <Button onClick={() => toast.warning('Partly saved')}>Warning toast</Button>
        <Button onClick={() => toast.error('Could not save')}>Error toast</Button>
        <Button onClick={() => toast.info('Queued')}>Info toast</Button>
      </div>
    </Section>
  </>
);
