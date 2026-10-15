/**
 * v2.5 Task 2E.3: the workbench's data hooks. Every query is keyed by the immutable ids it reads,
 * aborts when the selection changes (a stale response after a loop switch must never render), and
 * decoded artifacts are cached by evidence id + checksum.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAnalysisRun, getMethodRun, postReconstruction, type EvidenceArtifactMeta, type EvidenceManifest } from '../../../api/cpm/evidence';
import { TERMINAL_RUN_STATES } from './evidenceBasis';
import { loadArtifact, type DecodedArtifact } from './artifactCodec';
import { bundledChunkFetcher } from './chunkSource';
import { loadManifest } from './manifestBatcher';

export function useMethodRun(methodRunId: string | undefined) {
  return useQuery({
    queryKey: ['cpm', 'method-run', methodRunId ?? ''],
    queryFn: ({ signal }) => getMethodRun(methodRunId!, signal),
    enabled: !!methodRunId,
    staleTime: Infinity,                                   // immutable
  });
}

/**
 * `refetchMs` polls only while artifacts are still arriving (PENDING / PARTIAL); a COMPLETE manifest is immutable and never
 * re-read. CHG-099: a reconstruction is stored BESIDE a COMPLETE original, so while one is pending `settled` decides when
 * to stop (the run's own readiness stays COMPLETE throughout).
 */
export function useEvidenceManifest(methodRunId: string | undefined, refetchMs?: number, settled?: (m: EvidenceManifest) => boolean) {
  return useQuery({
    queryKey: ['cpm', 'evidence-manifest', methodRunId ?? ''],
    queryFn: ({ signal }) => loadManifest(methodRunId!, signal),           // v2.5 batching: coalesced with the sibling reads
    enabled: !!methodRunId,
    staleTime: (q) => (q.state.data?.readiness === 'COMPLETE' && !settled ? Infinity : 30_000),
    refetchInterval: refetchMs ? (q) => {
      const d = q.state.data;
      if (!d) return false;
      return (settled ? !settled(d) : d.readiness !== 'COMPLETE') ? refetchMs : false;
    } : undefined,
  });
}

export function useArtifact(meta: EvidenceArtifactMeta | undefined) {
  return useQuery<DecodedArtifact>({
    queryKey: ['cpm', 'artifact', meta?.artifactId ?? '', meta?.checksum ?? ''],
    queryFn: ({ signal }) => loadArtifact(meta!, bundledChunkFetcher(meta!.methodRunId), signal),   // the run bundle first
    enabled: !!meta && meta.readiness === 'COMPLETE',
    staleTime: Infinity,                                   // immutable bytes
    retry: false,                                          // a checksum mismatch is a fact, not a hiccup
  });
}

/** CHG-099: the reconstruction run's state while it is pending — each read refreshes it from the Flink job. */
export function useAnalysisRunState(analysisRunId: string | undefined, refetchMs: number) {
  return useQuery({
    queryKey: ['cpm', 'analysis-run', analysisRunId ?? ''],
    queryFn: ({ signal }) => getAnalysisRun(analysisRunId!, signal),
    enabled: !!analysisRunId,
    refetchInterval: q => (q.state.data && TERMINAL_RUN_STATES.has(q.state.data.state) ? false : refetchMs),
  });
}

export function useReconstruct(methodRunId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postReconstruction(methodRunId!),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cpm', 'evidence-manifest', methodRunId ?? ''] }); },
  });
}
