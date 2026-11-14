/**
 * CHG-170 (owner review, Pipeline Health): the selected job in the panel beside the list (it was a dialog; below 1280 px a drawer
 * a row opens). The role as eyebrow, the job once (its readable name), its state; then the five numbers the engine reports (a
 * value not read is a dash). A missing job says once why it has no numbers and who acts. CHG-184 (owner review Q1, Q6): no
 * Record details (the engine's raw job name, job id and start time).
 */
import React from 'react';
import { Inspector } from '../../../ui/Inspector';
import { KvRow, TonePill } from '../shared';
import { jobLabel, roleWord, stateView } from './jobState';
import { fmtAge, fmtBytes, fmtCheckpoints, fmtMs, fmtUptime, type JobRow } from './mergeJobs';

export const MISSING_TEXT = 'The engine does not list this required job, so it has no numbers. If it stays missing, ask the system administrator to check the analysis engine.';

export const JobPanel: React.FC<{ job: JobRow; open: boolean; onClose: () => void }> = ({ job, open, onClose }) => {
  const s = stateView(job.state);
  const c = job.checkpoint;
  const listed = job.state !== 'MISSING';
  return (
    <Inspector eyebrow={roleWord(job.role)} title={jobLabel(job.name)} open={open} onClose={onClose}
      meta={<TonePill tone={s.tone} glyph={s.glyph}>{s.word}</TonePill>}>
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
  );
};

export default JobPanel;
