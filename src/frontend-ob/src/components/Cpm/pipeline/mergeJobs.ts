import { fmtDuration } from '../shared';
import type { CpmJobMetrics, CpmJobRole, CpmOtherJob, CpmPipelineJob } from '../../../api/cpmApi';

/** One job: the supervisor's required list joined with what the engine reports about it. */
export interface JobRow {
  name: string;
  /** Null for a job the required list does not name. */
  role: CpmJobRole | null;
  state: string;
  running: boolean;
  /** False for a job the engine runs that the required list does not name. */
  required: boolean;
  /** Null when the engine does not list the job. */
  jid: string | null;
  startTime: string | null;
  uptimeSec: number | null;
  checkpoint: CpmJobMetrics['checkpoint'];
}

const fromMetrics = (m: CpmJobMetrics, required: boolean): JobRow => ({
  name: m.name, role: required ? m.role : null, state: m.state, running: m.state === 'RUNNING', required, jid: m.jid,
  startTime: m.startTime, uptimeSec: m.uptimeSec, checkpoint: m.checkpoint,
});

/**
 * Every required job is a row. A job the engine does not list keeps the supervisor's state (MISSING) and no
 * numbers: a value that was not read is null, never zero. The jobs off the required list follow as their own rows, marked
 * not required, so they are never hidden: CHG-170, the status read names them with their state (`otherJobs`, finished
 * on-demand runs left out by the server); the metrics read carries numbers only for required jobs. With no supervisor list
 * the engine's rows stand. Two engine entries with one name: the RUNNING one wins.
 */
export function mergeJobs(metricsJobs: CpmJobMetrics[], statusJobs: CpmPipelineJob[], otherJobs: CpmOtherJob[] = []): JobRow[] {
  if (statusJobs.length === 0) return metricsJobs.map(m => fromMetrics(m, true));
  const byName = new Map<string, CpmJobMetrics>();
  for (const m of metricsJobs) {
    const seen = byName.get(m.name);
    if (!seen || (seen.state !== 'RUNNING' && m.state === 'RUNNING')) byName.set(m.name, m);
  }
  const required = new Set(statusJobs.map(s => s.name));
  const rows = statusJobs.map((s): JobRow => {
    const m = byName.get(s.name);
    const state = m?.state ?? s.state;
    return {
      name: s.name, role: s.role, state, running: state === 'RUNNING', required: true,
      jid: m?.jid ?? null, startTime: m?.startTime ?? null, uptimeSec: m?.uptimeSec ?? null, checkpoint: m?.checkpoint ?? null,
    };
  });
  const extras = new Map<string, JobRow>();
  for (const m of byName.values()) if (!required.has(m.name)) extras.set(m.name, fromMetrics(m, false));
  for (const o of otherJobs) {
    if (required.has(o.name) || extras.has(o.name)) continue;
    extras.set(o.name, {
      name: o.name, role: null, state: o.state, running: o.state === 'RUNNING', required: false,
      jid: null, startTime: null, uptimeSec: null, checkpoint: null,
    });
  }
  return [...rows, ...extras.values()];
}

/** CHG-170: a value that was not read (the engine did not answer, the job is not running, or it is off the list). */
export const NOT_READ = '—';

export const fmtUptime = (sec: number | null | undefined) => {
  if (sec == null) return NOT_READ;
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const fmtBytes = (n: number | null | undefined) => {
  if (n == null) return NOT_READ;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

export const fmtMs = (ms: number | null | undefined) => {
  if (ms == null) return NOT_READ;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
};

export const fmtAge = (sec: number | null | undefined) => (sec == null ? NOT_READ : fmtDuration(sec * 1000));

/** "OK / failed" of one job's checkpoints, or a dash when they were not read. */
export const fmtCheckpoints = (c: CpmJobMetrics['checkpoint']) =>
  (c ? `${c.completed.toLocaleString('en-GB')} / ${c.failed.toLocaleString('en-GB')}` : NOT_READ);
