/**
 * v2.5 Task 2E.5 (spec §2.8, §6.5): the server-owned model review. The decision is bound to the
 * model id and its revision (If-Match); a stale revision is a 409 the reviewer must reload past.
 * Permission `cpm.model.review` gates the action; the dialog never changes state locally.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import { KvRow, PanelHead, TonePill } from '../shared';
import type { ReviewDecision, SystemModel } from '../../../api/cpm/response';
import { ApiError } from '../../../api/apiFetch';
import { quantityText, stateTone } from './responseSupport';

const DECISIONS: Array<{ key: ReviewDecision; label: string; hint: string }> = [
  { key: 'VALIDATED', label: 'Validated', hint: 'Holdout-checked and accepted inside the stated domain.' },
  { key: 'ACTIVE_BASELINE', label: 'Active baseline', hint: 'The reference model for this loop; supersedes the previous baseline.' },
  { key: 'REJECTED', label: 'Rejected', hint: 'Not usable; the reason goes in the note.' },
  { key: 'EXPIRED', label: 'Expired', hint: 'No longer represents the plant (change of context).' },
];

export const ModelReviewDialog: React.FC<{
  model: SystemModel; pending: boolean; error: unknown; onClose: () => void;
  onSubmit: (args: { modelId: string; revision: number; decision: ReviewDecision; note?: string; domain?: Record<string, unknown> }) => void;
}> = ({ model, pending, error, onClose, onSubmit }) => {
  const [decision, setDecision] = useState<ReviewDecision>('VALIDATED');
  const [note, setNote] = useState('');
  const [regime, setRegime] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const stale = error instanceof ApiError && error.status === 409;
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div className="cpm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <div ref={ref} className="cpm-modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label="Review system model">
        <PanelHead eyebrow="Model review" title={`${model.family} · ${model.pathId}`} right={<TonePill tone={stateTone(model.modelState)}>{model.modelState}</TonePill>} />
        <div className="cpm-response-quantities">
          <KvRow label="model">{model.modelId}</KvRow>
          <KvRow label="revision">{model.revision}</KvRow>
          <KvRow label="estimator / uncertainty">{model.estimator || '—'} / {model.uncertaintyMethod || '—'}</KvRow>
          {Object.entries(model.parameters ?? {}).map(([k, p]) => (
            <KvRow key={k} label={k}>{quantityText({ quantityId: k, value: p.value, unit: p.unit, uncertainty: p.uncertainty, method: p.method, pathId: model.pathId, supportFromMs: null, supportToMs: null, configHash: model.bundleHash, reasonIfNull: p.reason ?? '' })}</KvRow>
          ))}
          <KvRow label="created from event">{model.createdFromEvent ?? '—'}</KvRow>
        </div>
        <label className="cpm-field">
          <span className="cpm-field__label">Decision</span>
          <ObcToggleButtonGroup value={decision} aria-label="Decision"
            onValue={(e: CustomEvent<{ value: string }>) => { const v = e.detail.value as ReviewDecision; if (DECISIONS.some(d => d.key === v)) setDecision(v); }}>
            {DECISIONS.map(d => <ObcToggleButtonOption key={d.key} value={d.key}>{d.label}</ObcToggleButtonOption>)}
          </ObcToggleButtonGroup>
          <span className="cpm-copy">{DECISIONS.find(d => d.key === decision)?.hint}</span>
        </label>
        <label className="cpm-field">
          <span className="cpm-field__label">Approved regime (optional)</span>
          <input className="cpm-input" value={regime} onChange={e => setRegime(e.target.value)} placeholder="e.g. DEFAULT" />
        </label>
        <label className="cpm-field">
          <span className="cpm-field__label">Note</span>
          <textarea className="cpm-textarea" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Why this decision (recorded in the audit chain)" />
        </label>
        {stale && <p className="cpm-field__error" role="alert">This model was reviewed by someone else since you opened it. Close, reload the models and decide again.</p>}
        {forbidden && <p className="cpm-field__error" role="alert">Your account lacks cpm.model.review.</p>}
        {error && !stale && !forbidden ? <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null}
        <div className="cpm-wizard-footer">
          <ObcButton variant="flat" onClick={onClose} disabled={pending}>Cancel</ObcButton>
          <ObcButton variant="raised" disabled={pending || stale} onClick={() => onSubmit({ modelId: model.modelId, revision: model.revision, decision, note: note || undefined, domain: regime ? { regime } : undefined })}>
            {pending ? 'Recording…' : 'Record decision'}
          </ObcButton>
        </div>
      </div>
    </div>
  );
};
