/**
 * CHG-187 (owner review 9, 11.1): the gate head's "Measured vs required". A gate that compares measured values with thresholds
 * gets the button, which opens the dialog (cyan head, subtitle loop · gate). A gate that reports only a state gets the label
 * "State check" with its ? tip instead; when its window still has something open, a "What remains open" button opens the same
 * dialog without the table, so a limit is never dropped. Nothing is drawn while the thresholds load.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { ExplainWhy, hasCauses, useWhy, type WhyInput } from './ExplainWhy';

export const MeasuredCheck: React.FC<WhyInput & {
  /** The dialog's subtitle: "FIC10401 · G5 Oscillation (ACF)". */
  subtitle: string;
  /** Opens the loop's hypotheses on Investigation (the decision gate only). */
  onHypotheses?: () => void;
}> = ({ subtitle, onHypotheses, ...input }) => {
  const why = useWhy(input);
  const [open, setOpen] = useState(false);
  const measured = why.rows.length > 0;
  if (!measured && why.loading) return null;
  const more = why.open.length > 0 || hasCauses(why);
  const title = measured ? 'Measured vs required' : 'What remains open';
  return (
    <span className="cpm-measured">
      {!measured && (
        <span className="cpm-measured__state">
          State check
          <Toggletip variant="how-to" label="State check"><p>This gate reports a state, not a measured value against a threshold.</p></Toggletip>
        </span>
      )}
      {(measured || more) && <ObcButton variant="normal" aria-haspopup="dialog" onClick={() => setOpen(true)}>{title}</ObcButton>}
      <Dialog open={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle} size="wide">
        <ExplainWhy why={why} gate={input.gate} onHypotheses={onHypotheses} />
      </Dialog>
    </span>
  );
};

export default MeasuredCheck;
