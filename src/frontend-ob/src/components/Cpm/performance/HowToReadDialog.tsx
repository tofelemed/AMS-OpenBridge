'use client';

/**
 * "How to read" for Performance: the key to the gate marks, the three steps, and what the fleet cannot yet decide.
 * It was a docked column that took the evidence panel's place; as a dialog it is opened on request and takes no room.
 * The valve-position gap is the Diagnostic capability tile's, so it is not said twice here.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { GateLegend } from '../GateLegend';

export const HowToReadDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  summary?: CpmFleetSummary;
}> = ({ open, onClose, summary }) => (
  <Dialog open={open} onClose={onClose} title="How to read" size="wide">
    <GateLegend />
    <ol className="cpm-copy cpm-guide-steps">
      <li>Pick a gate tile to see which loops it is holding back.</li>
      {/* CHG-098 (SME review 2 #24): the readable view is the default; the full matrix is the advanced one */}
      <li>Each loop lists only the checks behind its result, by name. Click one to open its evidence; switch to the full G0–G15 matrix to see every gate.</li>
      <li>The result column is the fused verdict those gates produced.</li>
    </ol>
    {summary && (
      <p className="cpm-copy cpm-guide-note">
        {summary.capability.loopsWithoutDisturbanceContext} loops have no peer links, so stiction cannot be distinguished from an upstream disturbance.
      </p>
    )}
  </Dialog>
);

export default HowToReadDialog;
