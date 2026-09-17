/**
 * v2.5 Task 3D.1 (spec §5.6): the Governance page's approval queue is real - every validated or
 * shadow-evaluated bundle of the sites the user sees, waiting for an independent approver, and
 * every approved bundle not yet activated. Each row links into the workspace at that bundle.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, TonePill, fmtDateTime } from '../shared';
import { useCpmLoops } from '../../../hooks/useCpm';
import { listBundles, type Bundle } from '../../../api/cpm/config';
import { configHref } from './GateConfigurationWorkspace';
import { bundleStateTone, shortHash } from './configSupport';

const QUEUE_STATES = new Set(['VALIDATED', 'SHADOW_EVALUATED', 'APPROVED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']);

export const ConfigApprovalQueue: React.FC = () => {
  const navigate = useNavigate();
  const loops = useCpmLoops();
  const sites = useMemo(() => [...new Set((loops.data?.loops ?? []).map(l => l.site).filter(Boolean))].sort(), [loops.data]);
  const queries = useQueries({
    queries: sites.map(site => ({ queryKey: ['cpm', 'config', 'bundles', site, '', ''], queryFn: ({ signal }: { signal?: AbortSignal }) => listBundles(site, {}, signal), staleTime: 15_000 })),
  });
  const rows: Bundle[] = queries.flatMap(q => q.data?.bundles ?? []).filter(b => QUEUE_STATES.has(b.state)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const failed = queries.find(q => q.isError);
  if (failed) return <p className="cpm-field__error" role="alert">{failed.error instanceof Error ? failed.error.message : 'The bundle list could not be read.'}</p>;
  if (rows.length === 0) return <EmptyState title="Nothing awaiting approval or activation" copy="Validated drafts appear here for an independent approver; approved bundles until they are activated and verified." />;
  return (
    <table className="cpm-table" data-table="config-approval-queue">
      <thead><tr><th>site</th><th>scope</th><th>version</th><th>state</th><th>class</th><th>author</th><th>updated</th><th /></tr></thead>
      <tbody>
        {rows.map(b => (
          <tr key={b.bundleId}>
            <td>{b.site}</td><td>{b.scopeKind}{b.scopeRef ? ` ${b.scopeRef}` : ''}</td><td className="cpm-mono">v{b.version} · {shortHash(b.contentHash, 8)}</td>
            <td><TonePill tone={bundleStateTone(b.state)}>{b.state}</TonePill></td><td>{b.changeClass}</td><td>{b.createdBy}</td><td>{fmtDateTime(b.updatedAt)}</td>
            <td><ObcButton variant="flat" onClick={() => navigate(configHref({ site: b.site, scope: b.scopeKind, ref: b.scopeKind === 'SITE' ? undefined : b.scopeRef ?? undefined, bundle: b.bundleId }))}>Open ›</ObcButton></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
