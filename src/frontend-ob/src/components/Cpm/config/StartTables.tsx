/** "Changes in progress" and "Running now" on the Gate Configuration start page. */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import type { BundleSummary } from '../../../api/cpm/config';
import { realName } from './loopNames';
import { stamp, zoneTag } from '../events/eventTime';
import { plainNote } from './configWords';
import { levelWord, scopeTitle, versionLabel } from './levelWords';
import type { ChangeStep } from './configRoutes';
import type { InProgressRow, RunningRow } from './startPageData';

const STEP_WORD: Record<ChangeStep, string> = { edit: 'Edit', check: 'Check', try: 'Try on past data', approve: 'Approve', deploy: 'Deploy' };

/** "FIC10302 · own settings v13", "Flow, fast self-regulating · type settings v2", "Plant settings v2". */
function changeName(b: BundleSummary): string {
  if (b.inherits) return `${b.scopeRef ?? ''} · uses the plant-wide settings`;
  if (b.scopeKind === 'SITE') return versionLabel(b);
  return `${scopeTitle(b.scopeKind, b.scopeRef ?? '')} · ${levelWord(b.scopeKind).toLowerCase()} v${b.version}`;
}

export const ChangesTable: React.FC<{ rows: InProgressRow[]; onContinue: (id: string, step: ChangeStep) => void }> = ({ rows, onContinue }) => (
  <div className="cpm-config-tablewrap"><table className="cpm-table">
    <thead><tr><th>Change</th><th>Next step</th><th>Started</th><th><span className="cpm-sr-only">Continue</span></th></tr></thead>
    <tbody>
      {rows.map(({ bundle: b, nextStep, done }) => (
        <tr key={b.bundleId}>
          <td><strong>{changeName(b)}</strong>{plainNote(b.note) && <div className="cpm-event-row__sub">{plainNote(b.note)}</div>}</td>
          <td>
            <span className="cpm-config-prog" aria-hidden>{[0, 1, 2, 3, 4].map(i => <i key={i} data-seg={i < done ? 'done' : i === done ? 'current' : undefined} />)}</span>
            {STEP_WORD[nextStep]}
          </td>
          <td>{b.createdBy} · {stamp(b.createdAt)}</td>
          <td><ObcButton variant="normal" onClick={() => onContinue(b.bundleId, nextStep)}>Continue</ObcButton></td>
        </tr>
      ))}
    </tbody>
  </table></div>
);

export const RunningTable: React.FC<{ rows: RunningRow[]; loops: Map<string, CpmLoop> }> = ({ rows, loops }) => (
  <div className="cpm-config-tablewrap"><table className="cpm-table">
    <thead><tr><th>Applies to</th><th>Settings</th><th>Since · {zoneTag()}</th></tr></thead>
    <tbody>
      {rows.map(({ bundle: b, loopCount }) => {
        const l = b.scopeKind === 'LOOP' && b.scopeRef ? loops.get(b.scopeRef) : undefined;
        const sub = b.scopeKind === 'LOOP' ? (l ? realName(l) : '') : `${loopCount} ${loopCount === 1 ? 'loop' : 'loops'}`;
        return (
          <tr key={b.bundleId}>
            <td><strong>{scopeTitle(b.scopeKind, b.scopeRef ?? '')}</strong>{sub && <> <span className="cpm-event-row__sub">{sub}</span></>}</td>
            <td>{versionLabel(b)}</td>
            <td>{stamp(b.effectiveFrom)}</td>
          </tr>
        );
      })}
    </tbody>
  </table></div>
);
