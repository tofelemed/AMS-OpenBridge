'use client';

/**
 * CHG-221: "How to read" for Gate Configuration - the journey in five short plain lines, no backend terms.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';

const LINES = [
  'Pick what to change: one loop, a loop type, the whole plant or operating regions.',
  'A change goes through five steps: Edit, Check, Try on past data, Approve, Deploy.',
  'Someone other than the author approves; an Admin or SuperAdmin may approve their own change.',
  'A deployed change applies without a restart.',
  'Running now shows what every level runs.',
];

export const ConfigHowToRead: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (open ? (
  <Dialog open onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {LINES.map(line => <p key={line} className="cpm-copy">{line}</p>)}
    </div>
  </Dialog>
) : null);

export default ConfigHowToRead;
