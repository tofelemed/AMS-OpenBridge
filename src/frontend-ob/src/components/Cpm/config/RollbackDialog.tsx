/**
 * CHG-169 (owner answer 2a): Roll back asks first (it acted on the first click). The dialog names the activation it rolls back
 * and the version that runs again. The server chooses that version (the most recently updated SUPERSEDED or ACTIVE_VERIFIED
 * bundle of the same scope, other than this one); the dialog reads the scope's versions only once it opens and applies the same
 * rule to name it, and says "The bundle that ran before it" until they are read or when none qualifies. Roll back here sends
 * the same request as before: the rollback of the verified activation.
 */
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { KvRow } from '../shared';
import type { Bundle, BundleSummary, Deployment } from '../../../api/cpm/config';
import { useBundleSummaries } from './useConfig';
import { stampZoned } from './configWords';
import { BundleStatePill } from './configBits';

const CANDIDATE = new Set(['SUPERSEDED', 'ACTIVE_VERIFIED']);
const at = (s: string) => { const t = Date.parse(s); return Number.isNaN(t) ? 0 : t; };

/** The version a rollback of this bundle activates again, by the server's rule; null when the scope's versions hold none. */
export function rollbackTarget(bundle: Pick<Bundle, 'bundleId'>, scopeVersions: BundleSummary[]): BundleSummary | null {
  const candidates = scopeVersions.filter(v => v.bundleId !== bundle.bundleId && CANDIDATE.has(v.state));
  return candidates.sort((a, b) => at(b.updatedAt) - at(a.updatedAt) || b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

const Body: React.FC<{ bundle: Bundle; activation: Deployment; onCancel: () => void; onConfirm: () => void }> = ({ bundle, activation, onCancel, onConfirm }) => {
  const scope = useBundleSummaries(bundle.site, bundle.scopeKind, bundle.scopeRef || undefined);
  const target = useMemo(() => rollbackTarget(bundle, scope.data?.bundles ?? []), [bundle, scope.data]);
  return (
    <Dialog open onClose={onCancel} title="Roll back to the previous bundle"
      footer={<>
        <ObcButton variant="flat" onClick={onCancel}>Cancel</ObcButton>
        <ObcButton variant="raised" onClick={onConfirm}>Roll back</ObcButton>
      </>}>
      <KvRow label="Rolls back">The activation of v{bundle.version}, {stampZoned(activation.createdAt)}</KvRow>
      <KvRow label="Active again">
        {target
          ? <><span className="cpm-config-inline"><span>v{target.version}</span><BundleStatePill state={target.state} /></span><div className="cpm-event-row__sub">The bundle that ran before it</div></>
          : 'The bundle that ran before it'}
      </KvRow>
    </Dialog>
  );
};

/** On the page body, so the panel's own box (or its drawer) never clips it. */
export const RollbackDialog: React.FC<{ open: boolean; bundle: Bundle; activation: Deployment; onCancel: () => void; onConfirm: () => void }> = ({ open, ...props }) =>
  (open ? createPortal(<Body {...props} />, document.body) : null);

export default RollbackDialog;
