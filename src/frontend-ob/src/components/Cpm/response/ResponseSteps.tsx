/** Task 21: the four steps from a setpoint step to a reviewed model (empty state only) and the event states in a dialog. */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';

const STEPS: Array<[string, string, string]> = [
  ['1', 'Capture', 'SP or OP change'],
  ['2', 'Qualify', 'Accepted, rejected or censored'],
  ['3', 'Estimate', 'Candidate response model'],
  ['4', 'Review', 'Validated and baseline models'],
];
const STATES: Array<[string, string]> = [
  ['Accepted', 'Eligible for model fitting'],
  ['Rejected', 'Failed a qualification rule'],
  ['Censored', 'Incomplete response observation'],
];

export const ResponseSteps: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ol className="cpm-response-steps" aria-label="From a step to a reviewed model">
        {STEPS.map(([n, name, what]) => (
          <li key={n} className="cpm-response-steps__step">
            <strong>{n} {'·'} {name}</strong>
            <span className="cpm-muted">{what}</span>
          </li>
        ))}
      </ol>
      <ObcButton variant="flat" onClick={() => setOpen(true)}>Event states explained {'↗'}</ObcButton>
      <Dialog open={open} onClose={() => setOpen(false)} title="Response event states"
        footer={<ObcButton variant="flat" onClick={() => setOpen(false)}>Close</ObcButton>}>
        <dl className="cpm-response-states">
          {STATES.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="cpm-copy">Every event shows its rule and reason. No model is created without an accepted event.</p>
      </Dialog>
    </>
  );
};

export default ResponseSteps;
