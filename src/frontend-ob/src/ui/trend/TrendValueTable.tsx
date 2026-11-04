/**
 * The numbers behind the picture: a native table of the plotted points, paged, with units. It reads
 * the same snapshot as the tooltip, so a cell and a tooltip cannot differ. Only the open page is
 * formatted, so a day of samples costs nothing while the table is closed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { SegmentedControl } from '../SegmentedControl';
import { UNIT_NOT_SET, axisUnit, xFormat } from './trendFormat';
import { lowerBound, snapshotAt, windowTimes, type TrendModel } from './trendModel';
import type { Interval } from './trendTypes';

export const TABLE_PAGE_SIZE = 50;

type TableScope = 'window' | 'cursor';
const SCOPES = [
  { value: 'window' as const, label: 'Over the window' },
  { value: 'cursor' as const, label: 'At the cursor' },
];

/** Column headings, each with its unit. */
export function tableColumns(model: TrendModel, plotted: Interval, zone: string): string[] {
  return [
    xFormat(model.x, zone).name(plotted),
    ...model.series.map(s => `${s.source.label} (${axisUnit(s.axis.axis) ?? UNIT_NOT_SET})`),
    ...model.panes.flatMap(p => p.bands.map(b => `${b.source.label} (${axisUnit(b.axis.axis) ?? UNIT_NOT_SET})`)),
    ...model.lanes.map(l => l.label),
  ];
}

/** Cell texts of one row, in column order. The first is the row heading. */
export function tableCells(model: TrendModel, at: number, zone: string): string[] {
  const s = snapshotAt(model, at, zone);
  return [s.xText, ...s.values.map(v => v.text), ...s.bands.map(b => b.text), ...s.lanes.map(l => l.text)];
}

export const TrendValueTable: React.FC<{
  id: string;
  model: TrendModel;
  plotted: Interval;
  zone: string;
  /** The cursor on the chart, when one is placed. */
  cursor: number | null;
  /** The plotted window in words. */
  plottedText: string;
}> = ({ id, model, plotted, zone, cursor, plottedText }) => {
  const [scope, setScope] = useState<TableScope>('window');
  const [page, setPage] = useState(0);
  const points = useMemo(() => windowTimes(model.times, plotted), [model.times, plotted]);
  const columns = useMemo(() => tableColumns(model, plotted, zone), [model, plotted, zone]);

  const pages = Math.max(1, Math.ceil(points.length / TABLE_PAGE_SIZE));
  const shownPage = Math.min(page, pages - 1);
  const start = shownPage * TABLE_PAGE_SIZE;
  const stop = Math.min(points.length, start + TABLE_PAGE_SIZE);

  // The page follows the cursor, so its row is on screen as the cursor moves.
  useEffect(() => {
    if (cursor == null) return;
    const i = lowerBound(points, cursor);
    if (points[i] === cursor) setPage(Math.floor(i / TABLE_PAGE_SIZE));
  }, [cursor, points]);

  const rows = useMemo(() => {
    if (scope === 'cursor') return cursor == null ? [] : [cursor];
    return Array.from(points.subarray(start, stop));
  }, [scope, cursor, points, start, stop]);

  const summary = scope === 'cursor'
    ? 'Values at the cursor.'
    : points.length
      ? `Rows ${(start + 1).toLocaleString('en-GB')} to ${stop.toLocaleString('en-GB')} of ${points.length.toLocaleString('en-GB')}.`
      : 'No plotted samples in this window.';

  return (
    <div className="trend__table-block" id={id}>
      <SegmentedControl label="Value table scope" options={SCOPES} value={scope} onChange={setScope} />
      {scope === 'cursor' && cursor == null
        ? <p className="trend__note">No cursor placed. Click the chart, or focus it and press an arrow key.</p>
        : (
          <div className="trend__table-scroll" role="region" aria-label="Plotted values" tabIndex={0}>
            <table className="trend__table">
              <caption>{plottedText}. {summary}</caption>
              <thead>
                <tr>{columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(at => {
                  const [heading, ...cells] = tableCells(model, at, zone);
                  return (
                    <tr key={at} aria-current={at === cursor ? 'true' : undefined}>
                      <th scope="row">{heading}</th>
                      {cells.map((cell, i) => <td key={i}>{cell}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {scope === 'window' && pages > 1 && (
        <div className="trend__pager" role="group" aria-label="Value table pages">
          <ObcButton variant="flat" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>Previous</ObcButton>
          <span className="trend__note">Page {shownPage + 1} of {pages}</span>
          <ObcButton variant="flat" disabled={shownPage >= pages - 1} onClick={() => setPage(shownPage + 1)}>Next</ObcButton>
        </div>
      )}
    </div>
  );
};
