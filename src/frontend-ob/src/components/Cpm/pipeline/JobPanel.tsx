/**
 * CHG-170 (owner review, Pipeline Health): the selected job in the panel beside the list (it was a dialog; below 1280 px a drawer
 * a row opens). The role as eyebrow, the job once, its state; then the five numbers the engine reports (a value not read is a
 * dash). A missing job says once why it has no numbers and who acts. The engine's job name, id and start time are in Record
 * details (they were Technical details), the id short and copyable, "Started · UTC" over "11 Nov 10:35".
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { KvRow, TonePill } from '../shared';
import { DetailsDialog, type DetailRow } from '../config/DetailsDialog';
import { stamp, zoneTag } from '../events/eventTime';
import { jobLabel, roleWord, stateView } from './jobState';
import { fmtAge, fmtBytes, fmtCheckpoints, fmtMs, fmtUptime, type JobRow } from './mergeJobs';

export const MISSING_TEXT = 'The engine does not list this required job, so it has no numbers. If it stays missing, ask the system administrator to check the analysis engine.';

export const recordRowsOf = (job: JobRow): DetailRow[] => [
  { label: 'Engine job name', value: job.name },
  { label: 'Engine job id', copy: job.jid },
  { label: `Started · ${zoneTag(job.startTime ? Date.parse(job.startTime) : undefined)}`, value: stamp(job.startTime) },
];

export const JobPanel: React.FC<{ job: JobRow; open: boolean; onClose: () => void }> = ({ job, open, onClose }) => {
  const [record, setRecord] = useState(false);
  const s = stateView(job.state);
  const c = job.checkpoint;
  const listed = job.state !== 'MISSING';
  return (
    <>
      <Inspector eyebrow={roleWord(job.role)} title={jobLabel(job.name)} open={open} onClose={onClose}
        meta={<TonePill tone={s.tone} glyph={s.glyph}>{s.word}</TonePill>}
        primaryAction={listed ? (
          <div className="cpm-pipeline-panel-foot">
            <ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton>
          </div>
        ) : undefined}>
        {listed ? (
          <>
            <KvRow label="Uptime">{fmtUptime(job.uptimeSec)}</KvRow>
            <KvRow label="Checkpoints ok / failed">{fmtCheckpoints(c)}</KvRow>
            <KvRow label="Last checkpoint age">{fmtAge(c?.lastCompletedAgeSec)}</KvRow>
            <KvRow label="Last checkpoint duration">{fmtMs(c?.lastDurationMs)}</KvRow>
            <KvRow label="State size">{fmtBytes(c?.lastSizeBytes)}</KvRow>
          </>
        ) : <p className="cpm-copy">{MISSING_TEXT}</p>}
      </Inspector>
      <DetailsDialog title="Record details" open={record} onClose={() => setRecord(false)} rows={recordRowsOf(job)} />
    </>
  );
};

export default JobPanel;
