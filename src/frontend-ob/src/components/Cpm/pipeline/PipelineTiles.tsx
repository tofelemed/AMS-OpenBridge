/**
 * CHG-170 (owner review, Pipeline Health): four tiles in the Overview card style - label and icon, the number, one line with
 * tone + glyph + word. Required jobs (value and tone from the rows the list shows, one read; a transitional job ◐ starting, not
 * red), Last fused verdict (moved in from the Telemetry card: the Overview's rule, the newest 12 h result, ◐ Stale above 60 min;
 * under it Stale and Never evaluated open the Overview's own drill-downs, owner answer 3c), Checkpoint age (the oldest job's),
 * Checkpoints ok / failed. A tile opens what is behind it: it selects the job behind its number (the first not running, the
 * oldest checkpoint, the most failures) or, when no job stands behind it, moves to the list. A value not read is a dash.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ObiComputerServer } from '@oicl/openbridge-webcomponents-react/icons/icon-computer-server';
import { ObiTimerGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-timer-google';
import { ObiHistoryGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-history-google';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';
import type { CpmTone } from '../shared';
import { stamp, zoneTag } from '../events/eventTime';
import { ageText, type Freshness } from '../verdictFreshness';
import { isStarting, jobLabel } from './jobState';
import { NOT_READ, fmtAge, type JobRow } from './mergeJobs';

/** The Last fused verdict tile's reads: the fleet KPI answer (newest result, Stale and Never evaluated counts). */
export interface VerdictTileData {
  freshness: Freshness | undefined;
  loading: boolean;
  failed: boolean;
  stale: number | null;
  neverEvaluated: number | null;
  staleHref: string;
  neverHref: string;
}

type IconTone = 'good' | 'warn' | 'bad' | 'mode' | 'none';
const ICON_TONE: Record<CpmTone, IconTone> = { good: 'good', warn: 'warn', bad: 'bad', muted: 'none' };

const Glyph: React.FC<{ tone: CpmTone; children: string }> = ({ tone, children }) => (
  <b className={`cpm-pipeline-glyph cpm-pill--${tone}`} aria-hidden>{children}</b>
);

const Tile: React.FC<{
  label: string;
  Icon: React.ComponentType;
  tone: CpmTone;
  iconTone?: IconTone;
  value: string;
  sub: React.ReactNode;
  onOpen?: () => void;
  children?: React.ReactNode;
}> = ({ label, Icon, tone, iconTone = ICON_TONE[tone], value, sub, onOpen, children }) => {
  const body = (
    <>
      <span className="cpm-kpicard__head">
        <span className="cpm-kpicard__label">{label}</span>
        <span className={`cpm-kpicard__icon cpm-kpicard__icon--${iconTone}`} aria-hidden><Icon /></span>
      </span>
      <span className="cpm-kpicard__figure"><span className="cpm-kpicard__value">{value}</span></span>
      <span className="cpm-kpicard__sub">{sub}</span>
      {children}
    </>
  );
  const cls = `cpm-kpicard cpm-kpicard--headed cpm-kpicard--${tone} cpm-pipeline-tile`;
  return onOpen
    ? <button type="button" className={`${cls} cpm-kpicard--link`} onClick={onOpen}>{body}</button>
    : <div className={cls}>{body}</div>;
};

export const PipelineTiles: React.FC<{
  rows: JobRow[];
  statusLoaded: boolean;
  statusError: boolean;
  /** The JobManager answered (the metrics read's word when it has one, else the status read's). */
  engineAnswering: boolean | undefined;
  /** The checkpoint numbers were read: a metrics answer with the engine answering. */
  numbersRead: boolean;
  verdict: VerdictTileData;
  onSelect: (name: string) => void;
  /** Moves to the list when no single job stands behind a tile. */
  onList: () => void;
}> = ({ rows, statusLoaded, statusError, engineAnswering, numbersRead, verdict, onSelect, onList }) => {
  const required = rows.filter(r => r.required);
  const down = required.filter(r => !r.running);
  const firstDown = down[0] ?? required[0];
  const observed = numbersRead ? rows.filter(r => r.checkpoint) : [];
  const ok = observed.reduce((a, r) => a + r.checkpoint!.completed, 0);
  const failed = observed.reduce((a, r) => a + r.checkpoint!.failed, 0);
  const oldest = observed.filter(r => r.checkpoint!.lastCompletedAgeSec != null)
    .sort((a, b) => b.checkpoint!.lastCompletedAgeSec! - a.checkpoint!.lastCompletedAgeSec!)[0];
  const worst = observed.filter(r => r.checkpoint!.failed > 0).sort((a, b) => b.checkpoint!.failed - a.checkpoint!.failed)[0];

  // Required jobs: count and tone from the same rows
  const starting = down.length > 0 && down.every(r => isStarting(r.state));
  const reqTone: CpmTone = statusError ? 'warn' : !statusLoaded ? 'muted' : down.length === 0 && engineAnswering !== false ? 'good' : starting ? 'warn' : 'bad';
  const answering = engineAnswering === false ? 'analysis engine not answering' : 'analysis engine answering';
  const reqSub = statusError ? 'status endpoint unreachable' : !statusLoaded ? '' : engineAnswering === false
    ? <><Glyph tone="bad">✕</Glyph>{answering}</>
    : down.length === 0 ? <><Glyph tone="good">✓</Glyph>{answering}</>
      : starting ? <><Glyph tone="warn">◐</Glyph>{`${down.length} starting · ${answering}`}</>
        : <><Glyph tone="bad">✕</Glyph>{`${down.length} ${down.every(r => r.state === 'MISSING') ? 'missing' : 'not running'} · ${answering}`}</>;

  // Last fused verdict: the Overview's rule
  const f = verdict.freshness;
  const vTone: CpmTone = !f || f.at == null ? 'muted' : f.stale ? 'warn' : 'good';
  const vValue = f ? (f.ageMs != null ? ageText(f.ageMs) : NOT_READ) : verdict.loading ? '…' : NOT_READ;
  const vSub = f ? (f.at != null ? `window ended ${stamp(f.at)} ${zoneTag(f.at)}` : 'none stored yet')
    : verdict.loading ? '' : verdict.failed ? 'could not be read' : NOT_READ;
  const links = [
    (verdict.stale ?? 0) > 0 && (
      <span key="stale"><Glyph tone="warn">◐</Glyph>Stale · <Link className="cpm-link" to={verdict.staleHref}>{`${verdict.stale} loops ↗`}</Link></span>
    ),
    (verdict.neverEvaluated ?? 0) > 0 && (
      <Link key="never" className="cpm-link" to={verdict.neverHref}>{`Never evaluated ${verdict.neverEvaluated} ↗`}</Link>
    ),
  ].filter(Boolean);

  return (
    <div className="cpm-kpicards cpm-pipeline-tiles" role="list" aria-label="Pipeline figures">
      <div role="listitem">
        <Tile label="Required jobs" Icon={ObiComputerServer} tone={reqTone}
          value={statusError ? NOT_READ : statusLoaded ? `${required.length - down.length}/${required.length}` : '…'} sub={reqSub}
          onOpen={() => (firstDown ? onSelect(firstDown.name) : onList())} />
      </div>
      <div role="listitem">
        <Tile label="Last fused verdict" Icon={ObiTimerGoogle} tone={vTone} value={vValue} sub={vSub}>
          {links.length > 0 && (
            <span className="cpm-pipeline-tile__links">
              {links.map((l, i) => <React.Fragment key={i}>{i > 0 && ' · '}{l}</React.Fragment>)}
            </span>
          )}
        </Tile>
      </div>
      <div role="listitem">
        <Tile label="Checkpoint age" Icon={ObiHistoryGoogle} tone="muted" iconTone="mode"
          value={oldest ? fmtAge(oldest.checkpoint!.lastCompletedAgeSec) : NOT_READ}
          sub={oldest ? `oldest: ${jobLabel(oldest.name)}` : 'not read'}
          onOpen={() => (oldest ? onSelect(oldest.name) : onList())} />
      </div>
      <div role="listitem">
        <Tile label="Checkpoints ok / failed" Icon={ObiCheckGoogle} tone={observed.length === 0 ? 'muted' : failed === 0 ? 'good' : 'warn'}
          iconTone={observed.length === 0 ? 'mode' : undefined}
          value={observed.length > 0 ? `${ok.toLocaleString('en-GB')} / ${failed.toLocaleString('en-GB')}` : NOT_READ}
          sub={observed.length === 0 ? 'not read' : failed === 0
            ? <><Glyph tone="good">✓</Glyph>none failed · since job start</>
            : <><Glyph tone="warn">◐</Glyph>{`${failed} failed · since job start`}</>}
          onOpen={() => (worst ? onSelect(worst.name) : onList())} />
      </div>
    </div>
  );
};

export default PipelineTiles;
