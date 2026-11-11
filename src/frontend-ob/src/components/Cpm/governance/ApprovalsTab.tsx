/**
 * CHG-174 (owner review, badge 9, answers 1 and 4): what waits for approval or activation, every site the user sees, newest update
 * first (the same states as before: Validated, Shadow evaluated, Approved, Partially acknowledged, Activation failed). One list,
 * Bundle (its name, scope and version under it, the site where sites differ, ◆ State boundary when not Policy) · State in words ·
 * Author · Updated · UTC, with the selected bundle in a panel (a drawer below 1280 px). It read every bundle in full and showed raw
 * codes under lower-case headings, Open → on each row; it reads the summary projection now. Without cpm.config.read it says so
 * (each site answered 403 and the raw message showed).
 */
import React, { useMemo, useState } from 'react';
import type { BundleSummary } from '../../../api/cpm/config';
import { useAuthStore } from '../../../store/authStore';
import { EmptyState, PanelHead, QueryError } from '../shared';
import { stamp, zoneTag } from './auditTime';
import { ApprovalPanel, BundleState, ClassMark, scopeWords } from './ApprovalPanel';
import { bundleName, useBundleSummaries } from './useConfigNames';

export const QUEUE_STATES = new Set(['VALIDATED', 'SHADOW_EVALUATED', 'APPROVED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']);

export const ApprovalsTab: React.FC = () => {
  const canRead = useAuthStore(s => s.hasPermission('cpm.config.read'));
  const { queries } = useBundleSummaries(canRead);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const rows: BundleSummary[] = useMemo(
    () => queries.flatMap(q => q.data?.bundles ?? []).filter(b => QUEUE_STATES.has(b.state)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [queries],
  );
  if (!canRead) {
    return <section className="cpm-surface"><EmptyState title="The approval queue needs the cpm.config.read permission"
      copy="Gate-configuration bundles are read with it; approving and activating stay on Gate Configuration." /></section>;
  }
  const failed = queries.find(q => q.isError);
  const loading = queries.some(q => q.isLoading);
  const manySites = new Set(rows.map(b => b.site)).size > 1;
  const selected = rows.find(b => b.bundleId === selectedId) ?? rows[0];
  const pick = (b: BundleSummary) => { setSelectedId(b.bundleId); setDrawer(true); };

  return (
    <div className="cpm-master-detail cpm-gov-md">
      <section className="cpm-surface cpm-admin-list" aria-label="Waiting for approval or activation">
        <PanelHead title="Waiting for approval or activation" />
        {failed && (
          <QueryError title="The bundle list could not be read" error={failed.error}
            retry={() => { queries.filter(q => q.isError).forEach(q => void q.refetch()); }} />
        )}
        {!failed && loading && rows.length === 0 && <EmptyState title="Reading the bundles…" />}
        {!failed && !loading && rows.length === 0 && (
          <EmptyState title="Nothing awaiting approval or activation"
            copy="Validated drafts appear here for an independent approver; approved bundles until they are activated and verified." />
        )}
        {rows.length > 0 && (
          <table className="cpm-table cpm-reg-table cpm-admin-table cpm-gov-table cpm-gov-table--approvals">
            <thead><tr><th>Bundle</th><th>State</th><th>Author</th><th>Updated · {zoneTag()}</th></tr></thead>
            <tbody>
              {rows.map(b => {
                const on = b.bundleId === selected?.bundleId;
                return (
                  <tr key={b.bundleId} className={`cpm-reg-row${on ? ' cpm-reg-row--selected' : ''}`} aria-current={on ? 'true' : undefined} onClick={() => pick(b)}>
                    <td>
                      <button type="button" className="cpm-admin-rowlink" onClick={e => { e.stopPropagation(); pick(b); }}>
                        <strong>{bundleName(b)}</strong>
                        <span className="cpm-event-row__sub">
                          {scopeWords({ scopeKind: b.scopeKind, scopeRef: null })} · v{b.version}{manySites ? ` · ${b.site}` : ''}
                          {b.changeClass !== 'POLICY' && <> · <ClassMark changeClass={b.changeClass} /></>}
                        </span>
                      </button>
                    </td>
                    <td><BundleState state={b.state} /></td>
                    <td>{b.createdBy}</td>
                    <td>{stamp(b.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {selected && <ApprovalPanel bundle={selected} open={drawer} onClose={() => setDrawer(false)} />}
    </div>
  );
};

export default ApprovalsTab;
