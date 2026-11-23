/** Versions tab: this scope's versions, newest first; a row opens its change page. */
import React from 'react';
import { EmptyState, QueryError, TonePill } from '../shared';
import { stamp } from '../events/eventTime';
import type { ScopeKind } from '../../../api/cpm/config';
import { useBundleSummaries } from './useConfig';
import { stateWord, versionLabel } from './levelWords';
import { bundleStateWord } from './configWords';

export const VersionsTab: React.FC<{
  site: string; kind: ScopeKind; scopeRef: string | null; activeBundleId?: string;
  /** What the scope runs when it has no version of its own ("Type settings v1", "Factory settings"). */
  runsText?: string;
  onOpen: (bundleId: string) => void;
}> = ({ site, kind, scopeRef, activeBundleId, runsText, onOpen }) => {
  const q = useBundleSummaries(site, kind, scopeRef ?? undefined);
  if (q.isLoading) return <p className="cpm-copy" role="status">Loading…</p>;
  if (q.isError) return <QueryError error={q.error} retry={() => void q.refetch()} />;
  // the server filters by scope; a loop page shows only its own versions
  const rows = (q.data?.bundles ?? []).filter(b => b.scopeKind === kind && (b.scopeRef || null) === (scopeRef || null)).sort((a, b) => b.version - a.version);
  if (rows.length === 0) {
    return <EmptyState title={kind === 'LOOP' && runsText ? `No own versions — this loop runs ${runsText}.` : 'No versions yet'} />;
  }
  return (
    <table className="cpm-table" aria-label="Versions">
      <thead><tr><th>Version</th><th>State</th><th>Author</th><th>Updated</th></tr></thead>
      <tbody>
        {rows.map(b => (
          <tr key={b.bundleId} className="cpm-reg-row" aria-current={b.bundleId === activeBundleId ? 'true' : undefined}>
            <td>
              <button type="button" className="cpm-config-rowbtn" onClick={() => onOpen(b.bundleId)}>
                {b.inherits ? 'Uses the plant-wide settings' : versionLabel(b)}
              </button>
            </td>
            <td><TonePill tone={bundleStateWord(b.state).tone} glyph={bundleStateWord(b.state).glyph}>{stateWord(b.state)}</TonePill></td>
            <td>{b.createdBy}</td>
            <td>{stamp(b.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default VersionsTab;
