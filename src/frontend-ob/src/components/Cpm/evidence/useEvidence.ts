/**
 * v2.5 Task 2E.3: the workbench's data hooks. Every query is keyed by the immutable ids it reads,
 * aborts when the selection changes (a stale response after a loop switch must never render), and
 * decoded artifacts are cached by evidence id + checksum.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMethodRun, postReconstruction, type EvidenceArtifactMeta } from '../../../api/cpm/evidence';
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

/** `refetchMs` polls only while artifacts are still arriving (PENDING / PARTIAL); a COMPLETE manifest is immutable and never re-read. */
export function useEvidenceManifest(methodRunId: string | undefined, refetchMs?: number) {
  return useQuery({
    queryKey: ['cpm', 'evidence-manifest', methodRunId ?? ''],
    queryFn: ({ signal }) => loadManifest(methodRunId!, signal),           // v2.5 batching: coalesced with the sibling reads
    enabled: !!methodRunId,
    staleTime: (q) => (q.state.data?.readiness === 'COMPLETE' ? Infinity : 30_000),
    refetchInterval: refetchMs ? (q) => (q.state.data && q.state.data.readiness !== 'COMPLETE' ? refetchMs : false) : undefined,
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

export function useReconstruct(methodRunId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postReconstruction(methodRunId!),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cpm', 'evidence-manifest', methodRunId ?? ''] }); },
  });
}
