'use client';

/**
 * CHG-139: under the chart: how many results the range holds, and the Result key. The key is what the colours of the
 * Mode and Result lanes mean; it opens as a dialog so the lanes stay free of legends. CHG-159 (owner's design): the zoom
 * buttons moved up into the chart's head row, so this is the panel's foot strip.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';
import { BAND_WORD } from '../vocabulary';

const RESULT_KEY: Array<{ tone: CpmTone; words: string }> = [
  { tone: 'good', words: BAND_WORD.NO_FAULT },
  { tone: 'warn', words: `${BAND_WORD.DETECTED}, ${BAND_WORD.CLASSIFIED} or ${BAND_WORD.SUSPECTED}` },
  { tone: 'bad', words: BAND_WORD.CONFIRMED },
  { tone: 'muted', words: `${BAND_WORD.NOT_EVALUATED} or ${BAND_WORD.NO_DATA.toLowerCase()}` },
];
const MODE_KEY: Array<{ tone: CpmTone; words: string }> = [
  { tone: 'good', words: 'Automatic, cascade' },
  { tone: 'warn', words: 'Manual' },
  { tone: 'muted', words: 'Any other mode' },
];

export const ChartFoot: React.FC<{
  results: number;
  windowKind: string;
  /** More windows exist than were read. */
  capped: boolean;
  cap: number;
}> = ({ results, windowKind, capped, cap }) => {
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <div className="cpm-hist-foot" role="status">
      <span className="cpm-copy">
        {results} results · {windowKind} rolling windows{capped ? ` · newest ${cap} read` : ''}
      </span>
      <ObcButton variant="flat" onClick={() => setKeyOpen(true)}>Result key</ObcButton>
      <Dialog open={keyOpen} title="Result key" onClose={() => setKeyOpen(false)}
        footer={<ObcButton variant="normal" onClick={() => setKeyOpen(false)}>Close</ObcButton>}>
        <dl className="cpm-hist-key">
          <dt>Result lane</dt>
          {RESULT_KEY.map(k => <dd key={k.words}><TonePill tone={k.tone}>{k.words}</TonePill></dd>)}
          <dt>Mode lane</dt>
          {MODE_KEY.map(k => <dd key={k.words}><TonePill tone={k.tone}>{k.words}</TonePill></dd>)}
        </dl>
        <p className="cpm-copy">Each result is marked where its window ends.</p>
      </Dialog>
    </div>
  );
};

export default ChartFoot;
