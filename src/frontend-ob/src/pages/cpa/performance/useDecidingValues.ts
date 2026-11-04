/**
 * The deciding values of a selected cell against their thresholds, read the way Evidence reads them
 * (`whyRows`). Fetched only while a cell is selected. The configuration needs `cpm.config.read`, so
 * without it a threshold is restricted, not missing (RD11 D-20).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEffectiveConfig } from '../../../api/cpm/config';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { useEvidenceManifest } from '../../../components/Cpm/evidence/useEvidence';
import { whyRows } from '../../../components/Cpm/evidence/whyRules';
import { useAuthStore } from '../../../store/authStore';
import { honestRows } from './performanceModel';

/** The gates whose rows read a retained artifact. The others need no manifest request. */
const READS_ARTIFACTS = new Set(['G3', 'G5', 'G11']);

export function useDecidingValues(matrix: CpmGateMatrix | undefined, gate: string, runId: string | null) {
  const canReadConfig = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const loopId = matrix?.loopId;
  const at = matrix?.windowEnd ?? undefined;
  const config = useQuery({
    queryKey: ['cpm', 'why-config', loopId, at],
    queryFn: ({ signal }) => getEffectiveConfig(loopId as string, at, signal),
    enabled: !!loopId && canReadConfig,
    staleTime: 5 * 60_000,
  });
  const manifest = useEvidenceManifest(READS_ARTIFACTS.has(gate) && runId ? runId : undefined);

  const rows = useMemo(() => {
    if (!matrix) return [];
    const prov = (kind: string, key: string) => {
      const value = manifest.data?.artifacts.find(a => a.gate === gate && a.kind === kind)?.provenance?.[key];
      return value == null || value === '' ? undefined : String(value);
    };
    const eligibilityDetail = matrix.methodEligibility?.[gate]?.detail ?? null;
    const served = whyRows(gate, { prov, row: matrix, cfg: p => config.data?.properties?.[p], eligibilityDetail });
    return honestRows(served, { canReadConfig, configFailed: config.isError, diagnosis: matrix.diagnosis });
  }, [matrix, gate, manifest.data, config.data, config.isError, canReadConfig]);

  return {
    rows,
    /** True while a row could still read "no threshold" only because its source has not arrived. */
    loading: (canReadConfig && !!loopId && config.isLoading) || manifest.isLoading,
    config: config.data,
  };
}
