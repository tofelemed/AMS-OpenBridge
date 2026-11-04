/**
 * PRM-004 Phase 3: every shared component in its states, for contract evidence. Sample data only:
 * it calls no service. Absent from default builds; present only with VITE_CPA_COMPONENT_GALLERY=1.
 */
import React, { useState } from 'react';
import type { CpmLoop } from '../../api/cpmApi';
import { AssetPicker } from '../../ui/AssetPicker';
import { Button } from '../../ui/Button';
import { ContextHeader } from '../../ui/ContextHeader';
import { DataState } from '../../ui/DataState';
import { DataTable, type Column, type SortState } from '../../ui/DataTable';
import { Dialog } from '../../ui/Dialog';
import { GateBadge, GateKey } from '../../ui/GateBadge';
import { Inspector, WithInspector } from '../../ui/Inspector';
import { MetricSummary } from '../../ui/MetricSummary';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Ne107Badge, StatusBadge } from '../../ui/StatusBadge';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import { GalleryExtras } from './GalleryExtras';
import './gallery.css';

interface Row { tag: string; description: string; value: number; state: string }

const ROWS: Row[] = [
  { tag: 'FIC10302', description: 'Reactor feed flow', value: 41.2, state: 'Good' },
  { tag: 'TIC20411', description: 'Jacket temperature', value: 86.1, state: 'Uncertain' },
  { tag: 'LIC30107', description: 'Drum level', value: 52.7, state: 'Bad' },
];

const COLUMNS: Array<Column<Row>> = [
  { key: 'tag', header: 'Tag', cell: r => r.tag, sortable: true, mono: true, sticky: true },
  { key: 'description', header: 'Description', cell: r => r.description },
  { key: 'value', header: 'PV', cell: r => r.value.toFixed(1), sortable: true, align: 'end' },
  { key: 'state', header: 'Quality', cell: r => r.state },
];

const LOOPS = ROWS.map(r => ({ loopId: r.tag, displayName: r.description, site: 'Site', area: 'Area', unit: 'Unit', loopType: 'Loop' })) as CpmLoop[];

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section className="gallery__section" data-component={id} aria-label={title}>
    <h2 className="gallery__title">{title}</h2>
    <div className="gallery__body">{children}</div>
  </section>
);

const Badges: React.FC = () => (
  <>
    <div className="gallery__row">
      <StatusBadge tone="danger">Failed</StatusBadge>
      <StatusBadge tone="warning">Needs review</StatusBadge>
      <StatusBadge tone="success">Completed</StatusBadge>
      <StatusBadge tone="info">In progress</StatusBadge>
      <StatusBadge tone="unknown">Not evaluated</StatusBadge>
      <StatusBadge tone="neutral" caption="Signal quality">Good</StatusBadge>
    </div>
    <div className="gallery__row">
      <GateBadge status="PASS" gate="G0" />
      <GateBadge status="FAIL" gate="G3" />
      <GateBadge status="FAIL" gate="G0" />
      <GateBadge status="EXCLUDED_MODE" gate="G3" />
      <GateBadge status="PASS" gate="G7" />
      <GateBadge status="WARN" gate="G7" />
      <GateBadge status="CONFIRMED" gate="G15" />
    </div>
    <GateKey />
    <div className="gallery__row">
      <Ne107Badge code="F" /><Ne107Badge code="C" /><Ne107Badge code="S" /><Ne107Badge code="M" />
    </div>
  </>
);

const Tables: React.FC = () => {
  const [sort, setSort] = useState<SortState>({ key: 'tag', dir: 'asc' });
  const [selected, setSelected] = useState<string | null>('TIC20411');
  const onSort = (key: string) => setSort(s => ({ key, dir: s?.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const base = { columns: COLUMNS, rowKey: (r: Row) => r.tag };
  return (
    <>
      <DataTable {...base} caption="Loops sample" rows={ROWS} sort={sort} onSort={onSort} selectedKey={selected} onSelect={r => setSelected(r.tag)} />
      <DataTable {...base} caption="Compact sample" rows={ROWS} density="compact" />
      <DataTable {...base} caption="Empty sample" rows={[]} emptyTitle="No loops" emptyReason="No loop is registered in this scope." />
      <DataTable {...base} caption="Filtered sample" rows={[]} filtered onResetFilters={() => undefined} />
      <DataTable {...base} caption="Failed sample" rows={[]} error={new Error('Historian timed out')} onRetry={() => undefined} />
      <DataTable {...base} caption="Loading sample" rows={[]} loading />
    </>
  );
};

const States: React.FC = () => (
  <div className="gallery__grid">
    <DataState kind="loading" label="Loading sample panel" rows={2} />
    <DataState kind="empty" reason="No episodes in this period." />
    <DataState kind="filtered-empty" onReset={() => undefined} />
    <DataState kind="partial" reason="2 of 7 sources reported."><p>Retained panel</p></DataState>
    <DataState kind="stale" reason="No data since 4 Nov 13:15 GST."><p>41.2</p></DataState>
    <DataState kind="bad-quality" reason="Source quality is Bad."><p>41.2</p></DataState>
    <DataState kind="unavailable" reason="The historian is not reachable." onRetry={() => undefined} />
    <DataState kind="error" error={new Error('Historian timed out')} onRetry={() => undefined} />
    <DataState kind="restricted" reason="Your role does not include this page." />
  </div>
);

export default function ComponentGallery(): React.ReactElement {
  const [segment, setSegment] = useState('12h');
  const [tab, setTab] = useState('performance');
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [loop, setLoop] = useState('');

  return (
    <div className="gallery">
      <Section id="6.2" title="6.2 ContextHeader">
        <ContextHeader
          title="Loop"
          trail={[{ label: 'Overview', to: '/cpm' }]}
          identity="FIC10302 · Reactor feed flow"
          controls={<SegmentedControl label="Window" options={[{ value: '12h', label: '12 h' }, { value: '24h', label: '24 h' }]} value={segment} onChange={setSegment} />}
          primaryAction={<Button variant="primary">Review loop</Button>}
        />
      </Section>

      <Section id="6.3" title="6.3 MetricSummary">
        <MetricSummary
          label="Sample metrics"
          metrics={[
            { key: 'a', label: 'Time in normal mode', value: '98.2', unit: '%', window: '12 h window ending 4 Nov 13:15 GST', change: '±0 pp vs 24 h ago' },
            { key: 'b', label: 'Oscillating', value: 0, window: '12 h window' },
            { key: 'c', label: 'PV', value: '41.2', unit: 'kg/h', state: 'stale', note: 'No data since 13:15 GST' },
            { key: 'd', label: 'Valve position', value: null, note: 'No signal mapped' },
          ]}
        />
      </Section>

      <Section id="6.5" title="6.5 DataTable"><Tables /></Section>

      <Section id="6.6" title="6.6 Inspector">
        <WithInspector>
          <div className="gallery__panel">
            <p>Main view</p>
            <Button onClick={() => setDrawer(true)}>Open inspector</Button>
          </div>
          <Inspector title="FIC10302" open={drawer} onClose={() => setDrawer(false)} primaryAction={<Button variant="primary">Open loop</Button>}>
            <p>Selection detail</p>
          </Inspector>
        </WithInspector>
      </Section>

      <Section id="6.8" title="6.8 StatusBadge"><Badges /></Section>

      <Section id="6.9" title="6.9 SegmentedControl and Tabs">
        <SegmentedControl label="Window kind" options={[{ value: '12h', label: '12 h' }, { value: '24h', label: '24 h' }]} value={segment} onChange={setSegment} />
        <Tabs idBase="gallery" label="Sample tabs" options={[{ value: 'performance', label: 'Performance' }, { value: 'diagnosis', label: 'Diagnosis' }]} value={tab} onChange={setTab} />
        <div {...tabPanelProps('gallery', tab)}><p>Panel: {tab}</p></div>
      </Section>

      <Section id="6.11" title="6.11 Dialog">
        <Button onClick={() => setDialog(true)}>Open dialog</Button>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Shelve episode"
          description="Shelved episodes stay listed."
          footer={<><Button variant="ghost" onClick={() => setDialog(false)}>Cancel</Button><Button variant="primary" onClick={() => setDialog(false)}>Done</Button></>}
        >
          <p>Dialog body</p>
        </Dialog>
      </Section>

      <Section id="6.12" title="6.12 DataState"><States /></Section>

      <Section id="6.14" title="6.14 AssetPicker">
        <AssetPicker loops={LOOPS} value={loop} onSelect={setLoop} />
      </Section>

      <Section id="6.15" title="6.15 Buttons">
        <div className="gallery__row">
          <Button variant="primary">Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="accent">Accent outline</Button>
          <button type="button" className="ui-link">Link</button>
          <Button variant="primary" disabled reason="Needs the cpm.manage permission">Disabled</Button>
        </div>
      </Section>

      <GalleryExtras />
    </div>
  );
}
