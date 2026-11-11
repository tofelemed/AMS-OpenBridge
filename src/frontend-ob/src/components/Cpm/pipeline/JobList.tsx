/**
 * CHG-170 (owner review, Pipeline Health): one list grouped Alarm · CPLM · Platform (the supervisor's order inside each group),
 * then the jobs the required list does not name (owner answer 3d), with their state. Job, State (tone + glyph + word), Uptime,
 * Checkpoint age, OK / failed, numbers right-aligned under a heading that stays in view. A job the engine does not list says
 * "Not listed by the engine" once on its row (it read "Not exposed" three times). A required job's row selects it; a job off
 * the list carries no numbers and opens nothing. The foot holds Engine details: the JobManager address and the jobs off the
 * list (today's Technical details; "JobManager answering" went, the Required jobs tile says it).
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { TonePill } from '../shared';
import { DetailsDialog } from '../config/DetailsDialog';
import { CopyableId } from '../evidence/CopyableId';
import { groupRows, jobLabel, stateView } from './jobState';
import { NOT_READ, fmtAge, fmtCheckpoints, fmtUptime, type JobRow } from './mergeJobs';

export const LIST_ID = 'pipeline-jobs';

const Cells: React.FC<{ job: JobRow }> = ({ job }) => {
  const s = stateView(job.state);
  return (
    <>
      <span className="cpm-event-row__title">{jobLabel(job.name)}</span>
      <span><TonePill tone={s.tone} glyph={s.glyph}>{s.word}</TonePill></span>
      {job.required && job.state === 'MISSING'
        ? <span className="cpm-pipeline-row__note">Not listed by the engine</span>
        : (
          <>
            <span data-label="Uptime">{fmtUptime(job.uptimeSec)}</span>
            <span data-label="Checkpoint age">{fmtAge(job.checkpoint?.lastCompletedAgeSec)}</span>
            <span data-label="OK / failed">{job.checkpoint ? fmtCheckpoints(job.checkpoint) : NOT_READ}</span>
          </>
        )}
    </>
  );
};

export const JobList: React.FC<{
  rows: JobRow[];
  selected: string | null;
  onSelect: (name: string) => void;
  /** False while a state (loading, engine down, a failed first read) stands in for the rows. */
  showRows: boolean;
  /** That state, in place of the rows. */
  notices?: React.ReactNode;
  engine: { jobManagerUrl: string; unexpectedJobs: string[] } | undefined;
}> = ({ rows, selected, onSelect, showRows, notices, engine }) => {
  const [details, setDetails] = useState(false);
  return (
    <section id={LIST_ID} tabIndex={-1} className="cpm-surface cpm-pipeline-list" aria-label="Jobs">
      {showRows && (
        <div className="cpm-event-head cpm-pipeline-row cpm-table-head--sticky">
          <span>Job</span><span>State</span><span>Uptime</span><span>Checkpoint age</span><span>OK / failed</span>
        </div>
      )}
      {notices}
      {showRows && groupRows(rows).map(group => (
        <div key={group.title} role="group" aria-label={group.title}>
          <div className="cpm-pipeline-group" aria-hidden>{group.title}</div>
          <div role="list">
            {group.rows.map(job => {
              if (!job.required) {
                return (
                  <div key={job.name} role="listitem">
                    <div className="cpm-event-row cpm-event-row--dense cpm-pipeline-row cpm-pipeline-row--static"><Cells job={job} /></div>
                  </div>
                );
              }
              const isSelected = job.name === selected;
              const pick = () => onSelect(job.name);
              return (
                <div key={job.name} role="listitem">
                  <div className={`cpm-event-row cpm-event-row--dense cpm-pipeline-row${isSelected ? ' cpm-event-row--selected' : ''}`}
                    role="button" tabIndex={0} aria-current={isSelected ? 'true' : undefined}
                    onClick={pick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}>
                    <Cells job={job} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="cpm-pipeline-foot">
        <ObcButton variant="flat" onClick={() => setDetails(true)}>Engine details</ObcButton>
      </div>
      <DetailsDialog title="Engine details" open={details} onClose={() => setDetails(false)} rows={[
        // an address reads whole (CopyableId shortens ids to 8 characters by default)
        { label: 'JobManager address', value: <CopyableId label="JobManager address" value={engine?.jobManagerUrl} chars={engine?.jobManagerUrl.length} /> },
        { label: 'Jobs the engine runs that are not required', value: engine ? (engine.unexpectedJobs.join(', ') || 'None') : NOT_READ },
      ]} />
    </section>
  );
};

export default JobList;
