/**
 * v2.5 Task 2E.5 (spec §2.8, §6.5): the server-owned model review. The decision is bound to the
 * model id and its revision (If-Match); a stale revision is a 409 the reviewer must reload past.
 * Permission `cpm.model.review` gates the action; the dialog never changes state locally. CHG-184 (owner review item 0): the
 * model id and the id of the event it was created from are not shown (the revision stays: the decision is bound to it).
 * CHG-192 (owner review items 2, 16): the shared dialog (the cyan band, focus trap, Escape) instead of a page-local overlay;
 * titled "Review system model" with the model (family · path) under the title; the state and the facts as label / value rows
 * in sentence case; the form as the dialog's label / value rows, no caps labels; Cancel, then Record decision as the one primary.
 */
import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { KvRow, TonePill } from '../shared';
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
  const id = useId();
  const [decision, setDecision] = useState<ReviewDecision>('VALIDATED');
  const [note, setNote] = useState('');
  const [regime, setRegime] = useState('');
  const stale = error instanceof ApiError && error.status === 409;
  const forbidden = error instanceof ApiError && error.status === 403;
  const close = () => { if (!pending) onClose(); };
  return createPortal(
    <Dialog open title="Review system model" subtitle={`${model.family} · ${model.pathId}`} size="wide" onClose={close}
      footer={<>
        <ObcButton variant="normal" onClick={onClose} disabled={pending}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={pending || stale} onClick={() => onSubmit({ modelId: model.modelId, revision: model.revision, decision, note: note || undefined, domain: regime ? { regime } : undefined })}>
          {pending ? 'Recording…' : 'Record decision'}
        </ObcButton>
      </>}>
      <div className="cpm-response-quantities">
        <KvRow label="State"><TonePill tone={stateTone(model.modelState)}>{model.modelState}</TonePill></KvRow>
        <KvRow label="Revision">{model.revision}</KvRow>
        <KvRow label="Estimator / uncertainty">{model.estimator || '—'} / {model.uncertaintyMethod || '—'}</KvRow>
        {Object.entries(model.parameters ?? {}).map(([k, p]) => (
          <KvRow key={k} label={k}>{quantityText({ quantityId: k, value: p.value, unit: p.unit, uncertainty: p.uncertainty, method: p.method, pathId: model.pathId, supportFromMs: null, supportToMs: null, configHash: model.bundleHash, reasonIfNull: p.reason ?? '' })}</KvRow>
        ))}
      </div>
      <div className="cpm-run-form cpm-model-review__form">
        <span className="cpm-run-form__label">Decision</span>
        <div className="cpm-run-form__value cpm-model-review__decision">
          <SegmentedControl label="Decision" ignoreReselect value={decision} onChange={setDecision}
            options={DECISIONS.map(d => ({ value: d.key, label: d.label }))} />
          <span className="cpm-copy">{DECISIONS.find(d => d.key === decision)?.hint}</span>
        </div>
        <label className="cpm-run-form__label" htmlFor={`${id}-regime`}>Approved regime (optional)</label>
        <div className="cpm-run-form__value">
          <input id={`${id}-regime`} className="cpm-input" value={regime} onChange={e => setRegime(e.target.value)} placeholder="e.g. DEFAULT" />
        </div>
        <label className="cpm-run-form__label" htmlFor={`${id}-note`}>Note</label>
        <div className="cpm-run-form__value">
          <textarea id={`${id}-note`} className="cpm-textarea" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Why this decision (recorded in the audit chain)" />
        </div>
      </div>
      {stale && <p className="cpm-field__error" role="alert">This model was reviewed by someone else since you opened it. Close, reload the models and decide again.</p>}
      {forbidden && <p className="cpm-field__error" role="alert">Your account lacks cpm.model.review.</p>}
      {error && !stale && !forbidden ? <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null}
    </Dialog>,
    document.body,
  );
};
