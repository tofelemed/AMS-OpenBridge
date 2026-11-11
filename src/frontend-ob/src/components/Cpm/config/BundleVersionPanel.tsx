/**
 * CHG-169 (owner review, the approved sample): the version selected on Bundles, in the panel beside the list (a drawer below
 * 1280 px, the shared Inspector). Its heading names it once ("LOOP v6") with its state; the rows are the summary facts the
 * version buttons carried (change class, created, effective from, validation errors, the content hash short and copyable);
 * the foot opens it ("Open v6 →"). Choosing a row only selects; opening is the panel's one action.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { KvRow } from '../shared';
import { CopyableId } from '../evidence/CopyableId';
import type { BundleSummary } from '../../../api/cpm/config';
import { stampZoned } from './configWords';
import { BundleStatePill, ClassWord } from './configBits';

/** "LOOP v6" on a loop's levels; "LOOP FIC10301 v1" / "SITE hdpe v1" in the bundles in progress, where no loop names it. */
export const versionName = (b: BundleSummary, withScope: boolean): string =>
  withScope ? `${b.scopeKind} ${b.scopeRef || b.site} v${b.version}` : `${b.scopeKind} v${b.version}`;

export const BundleVersionPanel: React.FC<{
  bundle: BundleSummary;
  withScope: boolean;
  open: boolean;
  onClose: () => void;
  onOpen: (bundleId: string) => void;
}> = ({ bundle: b, withScope, open, onClose, onOpen }) => (
  <Inspector title={versionName(b, withScope)} open={open} onClose={onClose} meta={<BundleStatePill state={b.state} />}
    primaryAction={(
      <div className="cpm-reg-foot">
        <ObcButton variant="raised" onClick={() => onOpen(b.bundleId)}>Open v{b.version} {'→'}</ObcButton>
      </div>
    )}>
    <KvRow label="Change class"><ClassWord changeClass={b.changeClass} /></KvRow>
    <KvRow label="Created">{stampZoned(b.createdAt)}</KvRow>
    {b.effectiveFrom && <KvRow label="Effective from">{stampZoned(b.effectiveFrom)}</KvRow>}
    <KvRow label="Validation errors">{b.validationErrors}</KvRow>
    <KvRow label="Content hash"><CopyableId label="content hash" value={b.contentHash} /></KvRow>
  </Inspector>
);

export default BundleVersionPanel;
