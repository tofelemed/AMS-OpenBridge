'use client';

// Phase J — ad-hoc trend dialog over the canvas. Pre-populated with the selected tag(s) as pens.
// The chart is TrendCore (the Phase C engine), so cursor/zoom/live↔historical are the same code the
// canvas trend symbol uses. "Open in full page" promotes the same pen set to the deep-linkable
// /trend route in a NEW TAB, so the designer's unsaved canvas state can't be lost by a route change.
import React, { useEffect, useState } from 'react';
import TrendCore, { type PenSpec } from './TrendCore';

interface TrendDialogProps {
  pens: PenSpec[];
  /** Optional advisory, e.g. "showing the first 6 of 14 tags" — never truncate silently. */
  note?: string;
  onClose: () => void;
}

/** Deep-link for a pen set: /trend?tags=a,b,c */
export function trendUrl(pens: PenSpec[]): string {
  const tags = pens.map(p => p.path).join(',');
  return `/trend?tags=${encodeURIComponent(tags)}`;
}

export const TrendDialog: React.FC<TrendDialogProps> = ({ pens: initialPens, note, onClose }) => {
  const [pens, setPens] = useState<PenSpec[]>(initialPens);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="trend-dialog__backdrop" onMouseDown={onClose} data-testid="trend-dialog">
      <div className="trend-dialog" onMouseDown={e => e.stopPropagation()}>
        <div className="trend-dialog__head">
          <span className="trend-dialog__title">Trend — {pens.length} pen{pens.length === 1 ? '' : 's'}</span>
          <span className="trend-dialog__spacer" />
          <button
            className="trend-core__rbtn"
            data-testid="trend-fullpage"
            onClick={() => window.open(trendUrl(pens), '_blank', 'noopener')}
            title="Open this trend in a full page (new tab)"
          >Open in full page ↗</button>
          <button className="trend-core__rbtn" data-testid="trend-close" onClick={onClose}>Close</button>
        </div>
        {note && <div className="trend-dialog__note" data-testid="trend-note">{note}</div>}
        <div className="trend-dialog__body">
          <TrendCore
            pens={pens}
            onRemovePen={path => setPens(ps => ps.filter(p => p.path !== path))}
          />
        </div>
      </div>
    </div>
  );
};

export default TrendDialog;
