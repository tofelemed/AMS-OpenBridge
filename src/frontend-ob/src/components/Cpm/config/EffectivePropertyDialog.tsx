/**
 * Task 25: one effective property in a dialog: the facts the table row leaves out (the catalogue id, unit, type, default, what it
 * does) beside its value, the layer it comes from and its change class. Read-only; every value is the server's resolution.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import type { CatalogueEntry } from '../../../api/cpm/config';
import { isLayerSource, valueText } from './configSupport';

export const classTone = (c: string | undefined) => (c === 'DEPLOYMENT' ? 'bad' : c === 'STATE_BOUNDARY' ? 'warn' : 'muted');

export const EffectivePropertyDialog: React.FC<{
  property: string;
  value: unknown;
  source: string;
  entry: CatalogueEntry | undefined;
  onClose: () => void;
}> = ({ property, value, source, entry, onClose }) => (
  <Dialog open title={property} onClose={onClose}>
    <KvRow label="Value"><span className="cpm-mono">{valueText(value)}</span></KvRow>
    <KvRow label="Source">{isLayerSource(source) ? <TonePill tone={source === 'FACTORY' ? 'muted' : 'good'}>{source}</TonePill> : 'unset'}</KvRow>
    {entry && (
      <>
        <KvRow label="Class"><TonePill tone={classTone(entry.changeClass)}>{entry.changeClass}</TonePill></KvRow>
        <KvRow label="Id"><span className="cpm-mono">{entry.id}</span></KvRow>
        <KvRow label="Unit">{entry.unit || '—'}</KvRow>
        <KvRow label="Type">{entry.type}</KvRow>
        <KvRow label="Factory default"><span className="cpm-mono">{valueText(entry.default)}</span></KvRow>
        {entry.effect && <KvRow label="What it does">{entry.effect}</KvRow>}
        {entry.notReadByBuild && <KvRow label="Not read by this build">{entry.notReadByBuild}</KvRow>}
      </>
    )}
  </Dialog>
);

export default EffectivePropertyDialog;
