/**
 * Task 25: one effective property in a dialog: the facts the table row leaves out (unit, type, default, what it does) beside its
 * value, the layer it comes from and its change class. Read-only; every value is the server's resolution. CHG-184 (owner review
 * item 0): no catalogue id, no build wording. CHG-224: the setting by name (the code in a title), its source in plain words.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { KvRow, TonePill } from '../shared';
import type { CatalogueEntry } from '../../../api/cpm/config';
import { valueText } from './configSupport';
import { settingName, sourceWord } from './configWords';

export const classTone = (c: string | undefined) => (c === 'DEPLOYMENT' ? 'bad' : c === 'STATE_BOUNDARY' ? 'warn' : 'muted');

export const EffectivePropertyDialog: React.FC<{
  property: string;
  value: unknown;
  source: string;
  entry: CatalogueEntry | undefined;
  onClose: () => void;
}> = ({ property, value, source, entry, onClose }) => (
  <Dialog open title={settingName(property)} onClose={onClose}>
    <KvRow label="Value"><span className="cpm-mono">{valueText(value)}</span></KvRow>
    <KvRow label="From">{sourceWord(source)}</KvRow>
    {!entry && <p className="cpm-copy">The catalogue is not loaded, so class and unit are not shown.</p>}
    {entry && (
      <>
        <KvRow label="Class"><TonePill tone={classTone(entry.changeClass)}>{entry.changeClass}</TonePill></KvRow>
        <KvRow label="Unit">{entry.unit || '—'}</KvRow>
        <KvRow label="Type">{entry.type}</KvRow>
        <KvRow label="Factory default"><span className="cpm-mono">{valueText(entry.default)}</span></KvRow>
        {entry.effect && <KvRow label="What it does">{entry.effect}</KvRow>}
        {entry.notReadByBuild && <KvRow label="Not used">{entry.notReadByBuild}</KvRow>}
      </>
    )}
  </Dialog>
);

export default EffectivePropertyDialog;
