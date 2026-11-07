import type { CpmJobMetrics, CpmJobRole, CpmPipelineJob } from '../../../api/cpmApi';

/** One required job: the supervisor's list joined with what the engine reports about it. */
export interface JobRow {
  name: string;
  role: CpmJobRole;
  state: string;
  running: boolean;
  /** Null when the engine does not list the job. */
  jid: string | null;
  startTime: string | null;
  uptimeSec: number | null;
  checkpoint: CpmJobMetrics['checkpoint'];
}

/**
 * Every required job is a row. A job the engine does not list keeps the supervisor's state (MISSING) and no
 * numbers: a value that was not read is null, never zero. With no supervisor list the engine's own rows stand.
 */
export function mergeJobs(metricsJobs: CpmJobMetrics[], statusJobs: CpmPipelineJob[]): JobRow[] {
  if (statusJobs.length === 0) {
    return metricsJobs.map(m => ({
      name: m.name, role: m.role, state: m.state, running: m.state === 'RUNNING', jid: m.jid,
      startTime: m.startTime, uptimeSec: m.uptimeSec, checkpoint: m.checkpoint,
    }));
  }
  const byName = new Map(metricsJobs.map(m => [m.name, m]));
  return statusJobs.map(s => {
    const m = byName.get(s.name);
    const state = m?.state ?? s.state;
    return {
      name: s.name, role: s.role, state, running: state === 'RUNNING',
      jid: m?.jid ?? null, startTime: m?.startTime ?? null, uptimeSec: m?.uptimeSec ?? null, checkpoint: m?.checkpoint ?? null,
    };
  });
}

export const NOT_EXPOSED = 'Not exposed';

export const fmtUptime = (sec: number | null | undefined) => {
  if (sec == null) return NOT_EXPOSED;
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const fmtBytes = (n: number | null | undefined) => {
  if (n == null) return NOT_EXPOSED;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

export const fmtMs = (ms: number | null | undefined) => {
  if (ms == null) return NOT_EXPOSED;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
};

export const fmtAge = (sec: number | null | undefined) => (sec == null ? NOT_EXPOSED : `${sec} s`);
