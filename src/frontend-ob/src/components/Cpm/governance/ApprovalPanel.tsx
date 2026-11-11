/**
 * CHG-174 (owner review, badge 10, answer 1): the selected bundle of the approval queue in the panel beside the list (a drawer
 * below 1280 px): the bundle once with its state; Site, Scope, Change class, Author, Updated, Waits for; the loop ↗ for a loop
 * bundle; Record details (bundle id, content hash) and the exit on the Gate Configuration tab that step needs: Open approval →
 * (Approval) for a bundle waiting for an approver, Open deployments → (Deployments) for one waiting for activation. Approving,
 * activating and rolling back stay on Gate Configuration with every rule and refusal.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { BundleSummary } from '../../../api/cpm/config';
import { Inspector } from '../../../ui/Inspector';
import { configHref, registryHref } from '../cpaHref';
import { bundleStateWord, classWord } from '../config/configWords';
import { KvRow, TonePill } from '../shared';
import { stamp, zoneTag } from './auditTime';
import { RecordDialog, shortHash12 } from './RecordDialog';
import { bundleName } from './useConfigNames';

const TO_APPROVE = new Set(['VALIDATED', 'SHADOW_EVALUATED']);

/** What the bundle waits for, and the Gate Configuration tab that step is on. */
export function waitsFor(state: string): { what: string; exit: string; tab: 'approval' | 'deployments' } {
  if (TO_APPROVE.has(state)) return { what: 'Approval', exit: 'Open approval →', tab: 'approval' };
  if (state === 'APPROVED') return { what: 'Activation', exit: 'Open deployments →', tab: 'deployments' };
  return { what: 'A new activation (NOT active)', exit: 'Open deployments →', tab: 'deployments' };
}

/** "Loop FIC10301", "Site", "Profile pid_flow". */
export const scopeWords = (b: Pick<BundleSummary, 'scopeKind' | 'scopeRef'>): string =>
  b.scopeKind === 'SITE' ? 'Site' : `${b.scopeKind.charAt(0)}${b.scopeKind.slice(1).toLowerCase()}${b.scopeRef ? ` ${b.scopeRef}` : ''}`;

export const BundleState: React.FC<{ state: string }> = ({ state }) => {
  const w = bundleStateWord(state);
  return <TonePill tone={w.tone} glyph={w.glyph}>{w.label}</TonePill>;
};

export const ClassMark: React.FC<{ changeClass: string }> = ({ changeClass }) => {
  const c = classWord(changeClass);
  return c.glyph ? <span className={`cpm-pill--${c.tone}`}><span className="cpm-pill__glyph" aria-hidden>{c.glyph}</span> {c.label}</span> : <>{c.label}</>;
};

export const ApprovalPanel: React.FC<{ bundle: BundleSummary; open: boolean; onClose: () => void }> = ({ bundle: b, open, onClose }) => {
  const navigate = useNavigate();
  const [record, setRecord] = useState(false);
  const next = waitsFor(b.state);
  const ref = b.scopeKind === 'SITE' ? undefined : b.scopeRef ?? undefined;
  return (
    <>
      <Inspector eyebrow="Gate configuration bundle" title={bundleName(b)} meta={<BundleState state={b.state} />} open={open} onClose={onClose}
        primaryAction={
          <div className="cpm-admin-foot">
            <ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton>
            <ObcButton variant="raised" onClick={() => navigate(configHref({ site: b.site, scope: b.scopeKind, ref, bundle: b.bundleId, tab: next.tab }))}>
              {next.exit}
            </ObcButton>
          </div>
        }>
        <KvRow label="Site">{b.site}</KvRow>
        <KvRow label="Scope">{scopeWords(b)}</KvRow>
        <KvRow label="Change class"><ClassMark changeClass={b.changeClass} /></KvRow>
        <KvRow label="Author">{b.createdBy}</KvRow>
        <KvRow label={`Updated · ${zoneTag(Date.parse(b.updatedAt))}`}>{stamp(b.updatedAt)}</KvRow>
        <KvRow label="Waits for">{next.what}</KvRow>
        {b.scopeKind === 'LOOP' && b.scopeRef && (
          <div className="cpm-gov-links">
            <ObcButton variant="flat" onClick={() => navigate(registryHref(b.scopeRef))}>{`${b.scopeRef} ↗`}</ObcButton>
          </div>
        )}
      </Inspector>
      <RecordDialog title="Record details" open={record} onClose={() => setRecord(false)} parts={[{ rows: [
        { label: 'Bundle id', shown: b.bundleId, copy: b.bundleId },
        { label: 'Content hash', shown: shortHash12(b.contentHash), copy: b.contentHash },
      ] }]} />
    </>
  );
};

export default ApprovalPanel;
