/**
 * CHG-201 (owner-approved mockup, 15 Nov 2026): the Loop detail page's Signals card, full width. Each role with its pen (the one
 * signal colour source, --signal-*), its plain name, its tag in the control system (never the path), its unit and range, and
 * whether data arrives (from the loop's readiness, read once by the page). A readiness that cannot be read leaves the rest of the
 * table and says so, with Retry.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop, CpmReadiness } from '../../../../api/cpmApi';
import { DataTable, type Column } from '../../../../ui/DataTable';
import { Toggletip } from '../../../../ui/Toggletip';
import { WordPill, type PillWord } from '../WordPill';
import { DATA_WORD, signalRows, type DataState, type SignalRow } from './signalRows';
import { Section } from './Section';

const PILL: Partial<Record<DataState, PillWord['tone']>> = { receiving: 'plain', none: 'warn', expected: 'warn' };

const DataCell: React.FC<{ state: DataState }> = ({ state }) => {
  const tone = PILL[state];
  return tone ? <WordPill word={{ label: DATA_WORD[state], tone, glyph: tone === 'warn' ? '!' : undefined }} /> : <>{DATA_WORD[state]}</>;
};

const COLUMNS: Array<Column<SignalRow>> = [
  {
    key: 'signal', header: 'Signal',
    cell: r => (
      <span className="cpm-reg-sig">
        <span className="cpm-reg-swatch" data-pen={r.pen ?? undefined} aria-hidden />
        <span className="cpm-reg-sig__text"><strong>{r.role}</strong><span className="cpm-reg-desc">{r.name}</span></span>
      </span>
    ),
  },
  { key: 'tag', header: 'Source tag', cell: r => r.sourceTag ?? <span className="cpm-reg-muted">{r.missing}</span> },
  { key: 'unit', header: 'Unit', cell: r => r.unit },
  { key: 'range', header: 'Range', cell: r => r.range },
  { key: 'data', header: 'Data', cell: r => <DataCell state={r.data} /> },
];

interface ReadinessQuery {
  data?: Pick<CpmReadiness, 'checks'> & Partial<Pick<CpmReadiness, 'evidence'>>;
  isError?: boolean;
  refetch?: () => unknown;
}

export const SignalsSection: React.FC<{ loop: CpmLoop; readiness: ReadinessQuery }> = ({ loop, readiness }) => (
  <Section title="Signals" wide
    help={(
      <Toggletip variant="how-to" label="Signals">
        <p>The signals the analysis reads for this loop, each with its tag in the control system. Change them in Edit loop.</p>
      </Toggletip>
    )}>
    <div className="cpm-reg-signals">
      <DataTable caption="The loop’s signals" columns={COLUMNS} rows={signalRows(loop, readiness.data)} rowKey={r => r.role} />
    </div>
    {readiness.isError && (
      <p className="cpm-reg-note cpm-reg-retry">
        Whether data arrives could not be read.{' '}
        <ObcButton variant="flat" onClick={() => void readiness.refetch?.()}>Retry</ObcButton>
      </p>
    )}
  </Section>
);

export default SignalsSection;
