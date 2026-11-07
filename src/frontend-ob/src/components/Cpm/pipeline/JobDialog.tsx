/** A required job, read only: what the engine reports about it. Build and engine identifiers are closed under Technical details. */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { KvRow, TonePill, fmtDateTime } from '../shared';
import { NOT_EXPOSED, fmtAge, fmtBytes, fmtMs, fmtUptime, type JobRow } from './mergeJobs';

export const jobLabel = (name: string) => name.replace(/^AMS[ -]+/, '');

export const JobDialog: React.FC<{ job: JobRow; onClose: () => void }> = ({ job, onClose }) => {
  const c = job.checkpoint;
  return (
    <Dialog open title={jobLabel(job.name)} onClose={onClose}>
      <div className="cpm-pipeline-job">
        <KvRow label="State"><TonePill tone={job.running ? 'good' : 'bad'}>{job.state}</TonePill></KvRow>
        <KvRow label="Role">{job.role}</KvRow>
        <KvRow label="Uptime">{fmtUptime(job.uptimeSec)}</KvRow>
        <KvRow label="Checkpoints ok / failed">{c ? `${c.completed} / ${c.failed}` : NOT_EXPOSED}</KvRow>
        <KvRow label="Last checkpoint age">{fmtAge(c?.lastCompletedAgeSec)}</KvRow>
        <KvRow label="Last checkpoint duration">{fmtMs(c?.lastDurationMs)}</KvRow>
        <KvRow label="State size">{fmtBytes(c?.lastSizeBytes)}</KvRow>
        <TechnicalDetails items={[
          { label: 'Engine job name', value: job.name, mono: false },
          { label: 'Engine job id', value: job.jid },
          { label: 'Started', value: job.startTime ? fmtDateTime(job.startTime) : null, mono: false },
        ]} />
      </div>
    </Dialog>
  );
};

export default JobDialog;
