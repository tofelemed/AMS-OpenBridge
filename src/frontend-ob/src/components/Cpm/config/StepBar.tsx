/** The five steps of a change: Edit, Check, Try on past data (optional), Approve, Deploy. Each step is a button. */
import React from 'react';
import { Toggletip } from '../../../ui/Toggletip';
import type { ChangeStep } from './configRoutes';
import type { TabMark } from './lifecycle';

const STEPS: { key: ChangeStep; label: string; optional?: boolean }[] = [
  { key: 'edit', label: 'Edit' }, { key: 'check', label: 'Check' }, { key: 'try', label: 'Try on past data', optional: true },
  { key: 'approve', label: 'Approve' }, { key: 'deploy', label: 'Deploy' },
];

export const StepBar: React.FC<{
  current: ChangeStep; marks: Record<ChangeStep, TabMark>; onStep: (s: ChangeStep) => void; help?: Partial<Record<ChangeStep, React.ReactNode>>;
}> = ({ current, marks, onStep, help }) => (
  <ol className="cpm-config-steps" aria-label="Steps of this change">
    {STEPS.map((s, i) => {
      const mark = marks[s.key];
      const tone = mark === 'done' ? 'done' : mark === 'current' ? 'current' : 'todo';
      const state = mark === 'done' ? 'done' : mark === 'current' ? 'in progress' : 'not started';
      return (
        <li key={s.key} className={`cpm-config-step cpm-config-step--${tone}${s.key === current ? ' cpm-config-step--viewed' : ''}`}>
          <button type="button" className="cpm-config-step__btn" aria-current={s.key === current ? 'step' : undefined} onClick={() => onStep(s.key)}>
            <span className="cpm-config-step__n" aria-hidden>{marks[s.key] === 'done' ? '✓' : i + 1}</span>
            <span className="cpm-config-step__label">{s.label}</span>
            {s.optional && <small className="cpm-config-step__opt">optional</small>}
            <span className="cpm-sr-only">{`, ${state}`}</span>
          </button>
          {help?.[s.key] != null && <Toggletip variant="how-to" label={`About ${s.label}`}>{help[s.key]}</Toggletip>}
        </li>
      );
    })}
  </ol>
);

export default StepBar;
