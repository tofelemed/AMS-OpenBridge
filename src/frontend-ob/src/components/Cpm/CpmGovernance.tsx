'use client';

/**
 * CPLM Phase 7 — U12 Governance (/cpm/governance): who changed what and when, is the trail intact, what waits for approval or
 * activation, who may do what, which formula produced the verdicts. Read-only: approving, activating and rolling back stay on
 * Gate Configuration with every rule and refusal.
 *
 * CHG-174 (owner review, the approved sample docs/theme/redesign/samples/governance-proposal.html and the owner's answers of
 * 11 Nov 2026): the header is the eyebrow and the title (no ?, no sentence); top right How to read (a dialog for the open tab,
 * holding the page's ? texts and the approval rules) and, on the Audit trail, Verify audit chain with its last run in one line
 * under it (the Audit integrity card went). Four tabs in `?tab=`, without counts: Audit trail · Approvals · Separation of duties ·
 * Change traceability; they were one long scroll. A user without system.manage sees the Audit trail only, as the lower cards
 * showed to system.manage holders only. Verify sends the same request on the same permission, once; then the button reopens the
 * answer and Run again asks again.
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { WorkspaceHeader } from './shared';
import { AuditTrail } from './governance/AuditTrail';
import { ApprovalsTab } from './governance/ApprovalsTab';
import { DutiesTab } from './governance/DutiesTab';
import { ChangeTraceability } from './governance/ChangeTraceability';
import { GovernanceHowToRead, type GovernanceTab } from './governance/GovernanceHowToRead';
import { VerifyDialog, VerifyLine } from './governance/VerifyDialog';
import { ReasonedButton } from './ReasonedButton';
import { useVerifyAuditChain } from '../../hooks/useAudit';
import { useAuthStore } from '../../store/authStore';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import '../../styles/cpm-audit.css';

const TABS: ReadonlyArray<{ value: GovernanceTab; label: string }> = [
  { value: 'trail', label: 'Audit trail' },
  { value: 'approvals', label: 'Approvals' },
  { value: 'duties', label: 'Separation of duties' },
  { value: 'traceability', label: 'Change traceability' },
];

export const CpmGovernance: React.FC = () => {
  const canGovern = useAuthStore(s => s.hasPermission('system.manage'));
  const canAudit = useAuthStore(s => s.hasPermission('admin.audit.view'));
  const [params, setParams] = useSearchParams();
  const asked = TABS.find(t => t.value === params.get('tab'))?.value ?? 'trail';
  const tab: GovernanceTab = canGovern ? asked : 'trail';
  const [guide, setGuide] = useState(false);
  const verify = useVerifyAuditChain();
  const [verifying, setVerifying] = useState(false);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const run = () => verify.mutate(undefined, { onSettled: () => setRanAt(new Date()) });
  // Once an answer exists the button shows it. Only Run again in the dialog asks the service again.
  const hasAnswer = verify.isSuccess || verify.isError;
  const open = (next: GovernanceTab) => setParams(p => { if (next === 'trail') p.delete('tab'); else p.set('tab', next); return p; });

  return (
    <div className="cpm-screen cpm-gov">
      <WorkspaceHeader eyebrow="System" title="Governance"
        actions={<>
          <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>
          {tab === 'trail' && (
            <span className="cpm-gov-verify">
              <ReasonedButton variant="normal" disabled={!canAudit || verify.isPending}
                reason={!canAudit ? 'Needs the admin.audit.view permission' : null}
                onClick={() => { if (!hasAnswer) run(); setVerifying(true); }}>
                Verify audit chain
              </ReasonedButton>
              {canAudit && <VerifyLine verify={verify} ranAt={ranAt} />}
            </span>
          )}
        </>} />
      {canGovern && (
        <div className="cpm-tabs-row cpm-gov-tabs">
          <div className="cpm-tabs">
            <Tabs idBase="governance" label="Governance" options={TABS} value={tab} onChange={open} />
          </div>
        </div>
      )}
      <div className="cpm-gov__panel" {...(canGovern ? tabPanelProps('governance', tab) : {})}>
        {tab === 'trail' && <AuditTrail />}
        {tab === 'approvals' && <ApprovalsTab />}
        {tab === 'duties' && <DutiesTab />}
        {tab === 'traceability' && <ChangeTraceability />}
      </div>
      {verifying && <VerifyDialog verify={verify} ranAt={ranAt} onRunAgain={run} onClose={() => setVerifying(false)} />}
      <GovernanceHowToRead tab={tab} open={guide} onClose={() => setGuide(false)} />
    </div>
  );
};

export default CpmGovernance;
