/**
 * CHG-219 (owner-approved design docs/next-release/gate-configuration-per-loop-design.md §3): the batch panel above the per-loop
 * table. Each loop of the batch with its state; Approve (a second person) or "Approve alone (Admin)" (the author as Admin /
 * SuperAdmin), then Deploy; each row then follows its deployment until it is active.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, QueryError, TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import type { Batch, BatchRow } from '../../../api/cpm/configRegions';
import { bundleStateWord, deploymentStateWord } from './configWords';
import { WordPill } from './configBits';
import { rangeText, type BatchAction } from './regionEdit';

/** A row's state: its error first, then its deployment (once deployed), else its draft. */
export const BatchRowState: React.FC<{ row: BatchRow }> = ({ row }) => {
  if (row.error) return <TonePill tone="bad" glyph="✕">Not saved</TonePill>;
  return <WordPill word={row.deploymentState ? deploymentStateWord({ state: row.deploymentState }) : bundleStateWord(row.state)} />;
};

const rowNote = (r: BatchRow) => r.error ?? (r.problems.length ? r.problems.join(' · ') : null);

export interface RegionBatchPanelProps {
  batch: Batch | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  approve: BatchAction;
  deploy: BatchAction;
  approving: boolean;
  deploying: boolean;
  actionError: string | null;
  onApprove: (note: string) => void;
  onDeploy: () => void;
  onClose: () => void;
}

export const RegionBatchPanel: React.FC<RegionBatchPanelProps> = ({
  batch, loading, error, onRetry, approve, deploy, approving, deploying, actionError, onApprove, onDeploy, onClose,
}) => {
  const [note, setNote] = useState('');
  const rows = batch?.rows ?? [];
  return (
    <section className="cpm-surface cpm-config-list cpm-region-batch" aria-label="Batch">
      <PanelHead title={batch ? `Batch · ${batch.count} ${batch.count === 1 ? 'loop' : 'loops'}` : 'Batch'}
        right={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>} />
      {loading && !batch && <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the batch…</span></div>}
      {error != null && <QueryError title="Batch unavailable" error={error} retry={onRetry} />}
      {rows.length > 0 && (
        <table className="cpm-table cpm-config-rows">
          <thead><tr><th>Loop</th><th>New region</th><th>State</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.loopId}-${r.bundleId ?? 'x'}`}>
                <td><strong>{r.loopId}</strong></td>
                <td className="cpm-num">{rangeText(r.pvMin, r.pvMax) || 'Cleared'}</td>
                <td>
                  <BatchRowState row={r} />
                  {rowNote(r) && <div className="cpm-event-row__sub">{rowNote(r)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {batch && (
        <div className="cpm-config-form">
          <label className="cpm-field cpm-config-form__grow"><span className="cpm-field__label">Approval note</span>
            <input className="cpm-input" value={note} onChange={e => setNote(e.target.value)} disabled={!approve.enabled} /></label>
          <ReasonedButton variant={approve.enabled ? 'raised' : 'normal'} disabled={!approve.enabled || approving} reason={approve.reason}
            onClick={() => onApprove(note.trim())}>
            {approving ? 'Recording…' : approve.label}
          </ReasonedButton>
          <ReasonedButton variant={deploy.enabled ? 'raised' : 'normal'} disabled={!deploy.enabled || deploying} reason={deploy.reason} onClick={onDeploy}>
            {deploying ? 'Deploying…' : deploy.label}
          </ReasonedButton>
        </div>
      )}
      {actionError && <p className="cpm-field__error" role="alert">{actionError}</p>}
    </section>
  );
};

export default RegionBatchPanel;
