'use client';

/**
 * CHG-170 (owner answer 1): "How to read" for Pipeline Health, top right beside Jobs | Checkpoint history. A dialog in titled
 * parts - Job state, Numbers, Where a sample becomes a verdict, End-to-end verification - holding what the page's ? said, each
 * once. Corrected: the title's ? called the view read-only, but Run end-to-end verification submits a recompute; "an A8
 * recompute" is "a recompute"; the verdict is the Overview's rule. CHG-184 (owner review Q1): no engine state codes, no "Not
 * exposed" part (watermark and Kafka lag), and no Kafka, Flink, Postgres, IoTDB or supervisor names.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';

type Term = { pill: [tone: CpmTone, glyph: string, word: string] } | { term: string };
interface Part { title: string; rows?: Array<[Term, string]>; text?: string }

const parts = (freshMinutes: number, windowKind: string): Part[] => [
  { title: 'Job state', rows: [
    [{ pill: ['good', '✓', 'Running'] }, 'The engine runs the job.'],
    [{ pill: ['warn', '◐', 'Starting'] }, 'The engine is bringing the job up.'],
    [{ pill: ['bad', '✕', 'Missing'] }, 'A required job the engine does not list.'],
    [{ pill: ['bad', '✕', 'Failed'] }, 'The job has stopped or is stopping.'],
  ] },
  { title: 'Numbers', rows: [
    [{ term: 'Uptime' }, 'Since the engine started the job.'],
    [{ term: 'Checkpoint age' }, 'Since the job’s last completed checkpoint; the tile shows the oldest.'],
    [{ term: 'OK / failed' }, 'Checkpoints since the job started.'],
    [{ term: 'Last fused verdict' }, `The newest ${windowKind} result across the monitored loops, the Overview’s rule: ◐ Stale once it is older than ${freshMinutes} min.`],
    [{ term: '—' }, 'Not read: the engine did not answer, the job is not running, or it is not on the required list. Never an estimate, never 0.'],
  ] },
  { title: 'Where a sample becomes a verdict',
    text: 'From the DCS / edge to the analysis engine, then to the database and the historian. This page never starts or stops a job. Run end-to-end verification does write: it submits a recompute.' },
  { title: 'End-to-end verification',
    text: 'Submits a recompute on the chosen loop and waits for the batch verdict: historian read, normalise, gates, fused result stored. ✓ Verified only when the run wrote results.' },
];

export const PipelineHowToRead: React.FC<{ open: boolean; onClose: () => void; freshMinutes: number; windowKind: string }> = ({ open, onClose, freshMinutes, windowKind }) => (
  <Dialog open={open} onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {parts(freshMinutes, windowKind).map(part => (
        <section key={part.title} className="cpm-howto__part" aria-label={part.title}>
          <h3 className="cpm-howto__title">{part.title}</h3>
          {part.text && <p className="cpm-copy">{part.text}</p>}
          {part.rows && (
            <dl className="cpm-howto__key">
              {part.rows.map(([t, meaning]) => (
                <div key={meaning} className="cpm-howto__row">
                  <dt>{'pill' in t ? <TonePill tone={t.pill[0]} glyph={t.pill[1]}>{t.pill[2]}</TonePill> : t.term}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  </Dialog>
);

export default PipelineHowToRead;
