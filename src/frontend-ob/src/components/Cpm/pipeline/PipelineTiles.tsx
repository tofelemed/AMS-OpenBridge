/** The three tiles. Each names what its number comes from and leads to the jobs table, which takes focus. */
import React from 'react';
import { jobLabel } from './JobDialog';
import { NOT_EXPOSED, fmtAge, type JobRow } from './mergeJobs';

export const JOBS_ID = 'pipeline-jobs';

const jump = (ev: React.MouseEvent) => {
  const el = document.getElementById(JOBS_ID);
  if (!el) return;
  ev.preventDefault();
  el.scrollIntoView?.({ block: 'start' });
  el.focus();
};

const Tile: React.FC<{ caption: string; value: string; sub: string; tone: string }> = ({ caption, value, sub, tone }) => (
  <a className={`cpm-kpi cpm-kpi--${tone} cpm-response-tile`} href={`#${JOBS_ID}`} onClick={jump}>
    <span className="cpm-kpi__caption">{caption}</span>
    <span className="cpm-kpi__value">{value}</span>
    <span className="cpm-kpi__sub">{sub}</span>
  </a>
);

export const PipelineTiles: React.FC<{
  rows: JobRow[];
  statusLoaded: boolean;
  statusError: boolean;
  engineAnswering: boolean | undefined;
  allRequiredRunning: boolean | undefined;
}> = ({ rows, statusLoaded, statusError, engineAnswering, allRequiredRunning }) => {
  const required = rows.filter(r => r.required);
  const running = required.filter(r => r.running).length;
  const observed = rows.filter(r => r.checkpoint);
  const ok = observed.reduce((a, r) => a + r.checkpoint!.completed, 0);
  const failed = observed.reduce((a, r) => a + r.checkpoint!.failed, 0);
  const aged = observed.filter(r => r.checkpoint!.lastCompletedAgeSec != null)
    .sort((a, b) => b.checkpoint!.lastCompletedAgeSec! - a.checkpoint!.lastCompletedAgeSec!);
  const oldest = aged[0];
  return (
    <div className="cpm-kpi-row">
      {/* PH3: a failed status query must not sit at '…' forever. */}
      <Tile caption="Required jobs" tone={statusError ? 'warn' : allRequiredRunning ? 'good' : 'bad'}
        value={statusError ? '—' : statusLoaded ? `${running}/${required.length}` : '…'}
        sub={statusError ? 'status endpoint unreachable' : engineAnswering ? 'analysis engine answering' : 'analysis engine not answering'} />
      <Tile caption="Checkpoint age" tone="muted"
        value={oldest ? fmtAge(oldest.checkpoint!.lastCompletedAgeSec) : NOT_EXPOSED}
        sub={oldest ? `oldest: ${jobLabel(oldest.name)}` : 'oldest last checkpoint'} />
      <Tile caption="Checkpoints ok / failed" tone={observed.length > 0 && failed === 0 ? 'good' : 'warn'}
        value={observed.length > 0 ? `${ok.toLocaleString()} / ${failed}` : NOT_EXPOSED} sub="since job start" />
    </div>
  );
};

export default PipelineTiles;
