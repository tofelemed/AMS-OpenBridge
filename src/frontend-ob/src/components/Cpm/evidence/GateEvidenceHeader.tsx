/**
 * v2.5 Task 2E.3 (spec §3.2 header): what the reader is looking at, stated - loop / tag, the
 * selection mode (FIXED: this run, immutable), the support interval in the site zone, the source
 * age, the command path, the method and configuration identity, and the evidence readiness.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { MethodRun } from '../../../api/cpm/evidence';
import type { GateCatalogueEntry } from '../../../api/cpm/catalogue';
import { KvRow, TonePill, WorkspaceHeader, fmtDuration } from '../shared';
import { formatInZone, zoneLabel } from './timezone';
import type { EvidenceSelection } from './selection';

export const GateEvidenceHeader: React.FC<{
  selection: EvidenceSelection;
  run: MethodRun | undefined;
  entry: GateCatalogueEntry | undefined;
  loopName: string | undefined;
  timeZone: string;
  readiness: string | undefined;
  onGoToLatest?: () => void;
}> = ({ selection, run, entry, loopName, timeZone, readiness, onGoToLatest }) => {
  const from = run?.support.fromMs, to = run?.support.toMs;
  const ageMs = run ? Date.now() - new Date(run.computedAt).getTime() : null;
  const result = run?.result as Record<string, unknown> | null | undefined;
  const commandPath = (result?.command_path as string | undefined) ?? (run?.tier === 'response' ? String(result?.path_id ?? '—') : 'OP_TO_VALVE (registry default)');
  return (
    <>
      <WorkspaceHeader
        eyebrow="Evidence workbench"
        title={`${selection.loopId}${loopName ? ` · ${loopName}` : ''} — ${selection.gate}${entry ? ` ${entry.name}` : ''}`}
        copy={entry?.definition ?? 'The exact intermediates of one method run.'}
        actions={onGoToLatest ? <ObcButton variant="normal" onClick={onGoToLatest}>Go to the latest run ›</ObcButton> : undefined}
      />
      <div className="cpm-evidence-header">
        <TonePill tone="muted">{selection.mode}</TonePill>
        {run && <TonePill tone={run.identity.purpose === 'LIVE' ? 'good' : 'warn'}>{run.identity.purpose}</TonePill>}
        {readiness && <TonePill tone={readiness === 'COMPLETE' ? 'good' : readiness === 'FAILED' ? 'bad' : 'muted'}>evidence {readiness}</TonePill>}
        <KvRow label="Support">
          {from != null && to != null
            ? `${formatInZone(from, timeZone)} → ${formatInZone(to, timeZone)} · ${zoneLabel(timeZone, from)} · ${run?.windowKind}${run?.support.sampleCount != null ? ` · ${run.support.sampleCount} samples` : ''}`
            : '—'}
        </KvRow>
        <KvRow label="Source age">{ageMs != null ? `computed ${fmtDuration(ageMs)} ago` : '—'}</KvRow>
        <KvRow label="Command path">{commandPath}</KvRow>
        <KvRow label="Method">{entry ? `${entry.method.id} v${entry.method.version} (${entry.method.state})` : '—'}</KvRow>
        <KvRow label="Configuration">
          {run ? `${run.identity.bundleHash} · context r${run.identity.contextRevision} · result r${run.identity.resultRevision}` : '—'}
        </KvRow>
        <KvRow label="Build">{run ? `${(run.identity.sourceCommit ?? 'unknown').slice(0, 12)} · jar ${(run.identity.jarSha256 ?? 'unknown').slice(0, 12)}` : '—'}</KvRow>
        <KvRow label="Run">{selection.methodRunId}</KvRow>
      </div>
    </>
  );
};
