// CHG-168 (owner review, the approved sample, badge 13): Bulk import is a dialog with tabs File · Review · Activate and
// "Next: X →"; each count said once; the step name not repeated; Status before the paths. The same parsing, checks and the ONE
// bulk-activate request with the same payload as before.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CpmLoop } from '../../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar', () => ({ ObcProgressBar: () => null }));
vi.mock('../../../../hooks/useCpm', () => ({
  useCpmRegistryContract: () => ({ data: { loopTypes: ['FIC', 'PIC', 'PIC_GAS', 'PIC_VAPOUR', 'LIC', 'TIC', 'UNKNOWN'] } }),
}));
vi.mock('../../plantLocation', async (orig) => ({
  ...(await orig<typeof import('../../plantLocation')>()),
  usePlantLocations: () => ({ data: undefined }),
}));
const bulk = vi.fn();
vi.mock('../../../../api/cpmApi', () => ({ bulkActivateLoops: (...a: unknown[]) => bulk(...a) }));
const download = vi.fn();
vi.mock('../../../../utils/csv', () => ({ downloadTextFile: (...a: unknown[]) => download(...a) }));

import { BulkImportDialog } from '../../BulkImportDialog';

const HEAD = 'tag,service,site,area,unit,loop_type,criticality,pv_tag,sp_tag,op_tag,mode_tag,vp_tag,profile,pv_min,pv_max,op_min,op_max,pv_unit,vp_applicability,peer_applicability';
const CSV = [HEAD,
  'FIC10499,Illustrative flow loop,hdpe,section_600,u6002,FIC,medium,,,,,,,0,2500,0,100,kg/h,,',
  'FIC10401,Flow controller FIC10401 (FCS0101),hdpe,section_600,u6002,FIC,medium,,,,,,,0,2500,0,100,kg/h,,',
  'TIC 999,,hdpe,,,XIC,urgent,,,,,,,abc,,,,,,'].join('\n');
const existing = [{ loopId: 'FIC10401' } as CpmLoop];

const show = () => render(
  <QueryClientProvider client={new QueryClient()}><BulkImportDialog existing={existing} onClose={() => undefined} /></QueryClientProvider>);
const next = () => screen.getByRole('button', { name: /^Next: / }) as HTMLButtonElement;
const paste = (text = CSV) => fireEvent.change(screen.getByLabelText('CSV content'), { target: { value: text } });
const tab = (name: string) => screen.getByRole('tab', { name });

beforeEach(() => { bulk.mockReset(); download.mockReset(); });
afterEach(cleanup);

describe('BulkImportDialog', () => {
  it('is a dialog titled Bulk import with tabs File, Review and Activate, the step not named twice', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Bulk import' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['File', 'Review', 'Activate']);
    for (const gone of ['Bulk registry workflow', /Import loops from CSV/, /1\. Import file/]) expect(screen.queryByText(gone)).toBeNull();
    expect(tab('Review').getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the source rules behind the ? and downloads the template', () => {
    show();
    expect(screen.queryByText(/Required columns/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.getByText(/All columns: tag, service, site, area, unit, loop_type/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download template' }));
    expect(download).toHaveBeenCalledWith('cplm-loop-registry-template.csv', expect.stringMatching(/^tag,service,site/));
  });

  it('counts the rows once and says why Next waits', () => {
    show();
    expect(next().disabled).toBe(true);
    expect(screen.getByText('Provide the registry rows, with every required column, first')).toBeTruthy();
    paste('tag,service\nX,Y');
    expect(screen.getByText('Missing required columns: site, loop_type')).toBeTruthy();
    paste();
    expect(screen.getAllByText('3 rows').length).toBe(1);
    expect(next().disabled).toBe(false);
    expect(next().textContent).toBe('Next: Review →');
  });

  it('reviews the rows on one line, Status before the paths, the paths under the location', () => {
    show();
    paste();
    fireEvent.click(next());
    const line = screen.getByTestId('cpm-import-summary');
    expect(line.textContent).toBe('3 rows: ✓2 ready (1 updates an existing loop) · ✕1 needs correction. Rows that need correction are skipped.');
    for (const gone of ['Rows detected', 'Need correction', 'Existing (will update)', /of 3 row\(s\) ready/]) expect(screen.queryByText(gone)).toBeNull();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Loop', 'Location', 'Type', 'Status', 'PV / SP / OP / MODE / VP']);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Ready')).toBeTruthy();
    expect(within(rows[0]).getByText('…/fic10499 .pv .sp .op .mode')).toBeTruthy();
    expect(within(rows[1]).getByText('Updates existing')).toBeTruthy();
    expect(within(rows[2]).getByText('Needs correction')).toBeTruthy();
    expect(rows[2].textContent).toMatch(/missing service; loop tag "TIC 999".*criticality "urgent" must be low, medium, high or critical; pv_min 'abc' is not a number/);
  });

  it('activates the ready rows in one request with the payload as before, and shows failures first', async () => {
    bulk.mockResolvedValue({ activated: 1, failed: 1, elapsedMs: 1200, results: [
      { loopId: 'FIC10499', ok: false, error: 'Location hdpe / section_600 / u6002 is not in the asset model.' }, { loopId: 'FIC10401', ok: true }] });
    show();
    paste();
    fireEvent.click(next());
    fireEvent.click(next());
    expect(screen.getByText('2 loops to activate:').parentElement!.textContent).toMatch(/^2 loops to activate: 1 new, 1 updates an existing loop · 1 row skipped/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow locations that are not in the asset model' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Activate 2 loops' })); });
    expect(bulk).toHaveBeenCalledTimes(1);
    const [loops] = bulk.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(loops.map(l => l.loopId)).toEqual(['FIC10499', 'FIC10401']);
    expect(loops[0]).toEqual({
      loopId: 'FIC10499', displayName: 'Illustrative flow loop', site: 'hdpe', area: 'section_600', unit: 'u6002', loopType: 'FIC',
      criticality: 'medium', thresholdProfileId: null, enableMonitoring: true, allowUnmodelledLocation: true,
      engineering: { pvMin: 0, pvMax: 2500, opMin: 0, opMax: 100, pvUnit: 'kg/h' },
      tags: ['pv', 'sp', 'op', 'mode'].map(r => ({ signalRole: r.toUpperCase(), unsPath: `hdpe/section_600/u6002/fic10499.${r}` })),
    });
    expect(screen.getByText('1 activated, 1 failed')).toBeTruthy();
    expect(screen.getByText('Completed in 1.2 s.')).toBeTruthy();
    expect(screen.getByText('Location hdpe / section_600 / u6002 is not in the asset model.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fix and re-import' }));
    expect(tab('File').getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('CSV content') as HTMLTextAreaElement).value).toBe(CSV);
  });

  it('reports a whole-batch failure against every row', async () => {
    bulk.mockRejectedValue(new Error('Gateway timeout'));
    show();
    paste();
    fireEvent.click(next());
    fireEvent.click(next());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Activate 2 loops' })); });
    expect(screen.getAllByText('Gateway timeout').length).toBe(2);
    expect(screen.getByText('0 activated, 2 failed')).toBeTruthy();
  });

  it('says why Next waits when no row is ready, and goes back to File by its tab', () => {
    show();
    paste([HEAD, 'TIC 999,,hdpe,,,XIC,urgent,,,,,,,abc,,,,,,'].join('\n'));
    fireEvent.click(next());
    expect(next().disabled).toBe(true);
    expect(screen.getAllByText(/No row is ready to import/).length).toBeGreaterThan(0);
    fireEvent.click(tab('File'));
    expect(tab('File').getAttribute('aria-selected')).toBe('true');
  });
});
