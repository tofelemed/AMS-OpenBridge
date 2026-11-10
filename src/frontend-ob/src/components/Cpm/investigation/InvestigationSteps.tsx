/**
 * CHG-160 (owner review): the Investigation in the engineer's order, one step per tab. Result: what did the engine conclude,
 * and how sure is it. Evidence: is it backed by the data. Windows: is it new, or has it persisted. Hypotheses: which
 * mechanism explains it. Review: what to check next, and what was decided. The step lives in `?tab=`; a gate or a card named
 * in a link opens Evidence, as the links from other pages expect. Each step but the last ends with Next.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Tabs, tabPanelProps } from '../../../ui/Tabs';

export const STEPS = ['Result', 'Evidence', 'Windows', 'Hypotheses', 'Review'] as const;
export type InvestigationStep = (typeof STEPS)[number];

const OPTIONS = STEPS.map(s => ({ value: s, label: s }));

/** The step in the address; without one, a gate or a card named in the link opens Evidence. */
export function stepOf(params: URLSearchParams): InvestigationStep {
  const tab = params.get('tab');
  if (tab && (STEPS as readonly string[]).includes(tab)) return tab as InvestigationStep;
  return params.get('gate') || params.get('tier') ? 'Evidence' : 'Result';
}

export const InvestigationSteps: React.FC<{
  step: InvestigationStep;
  onStep: (step: InvestigationStep) => void;
  children: React.ReactNode;
}> = ({ step, onStep, children }) => {
  const next = STEPS[STEPS.indexOf(step) + 1];
  return (
    <section className="cpm-surface cpm-inv-steps">
      <div className="cpm-tabs-row">
        <div className="cpm-tabs">
          <Tabs idBase="investigation" label="Investigation steps" options={OPTIONS} value={step} onChange={onStep} />
        </div>
      </div>
      <div className="cpm-tabpanel" {...tabPanelProps('investigation', step)}>{children}</div>
      {next && (
        <div className="cpm-inv-steps__foot">
          <ObcButton variant="normal" onClick={() => onStep(next)}>Next: {next} →</ObcButton>
        </div>
      )}
    </section>
  );
};

export default InvestigationSteps;
