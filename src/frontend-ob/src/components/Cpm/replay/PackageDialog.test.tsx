// Task 18: the Evidence package is a real zip: a manifest naming every file, and the window's evidence package.
import React from 'react';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as exportsMod from '../historical/historyExports';
import { row } from '../evidence/windowFixtures';
import { buildEvidenceZip } from './packageZip';
import { PackageDialog } from './PackageDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../historical/historyExports', async importOriginal => ({
  ...(await importOriginal<typeof import('../historical/historyExports')>()),
  evidencePackage: vi.fn(),
}));

const END = '2026-10-05T12:30:00Z';
const win = row(END, { windowKind: '12h', methodRunIds: { G15: 'run-g15' }, metadata: { calculationVersion: '3.0.0', dynamicsProfileVersion: '2', replayId: null } as never });

afterEach(cleanup);

describe('buildEvidenceZip', () => {
  it('holds manifest.json that names every file, and the evidence package itself', async () => {
    const bytes = await buildEvidenceZip({ loopId: 'A', displayName: 'Feed', row: win, timeZone: 'UTC', packageJson: '{"packageVersion":1}', exported: '2026-10-06T00:00:00Z' });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(['evidence-package.json', 'manifest.json']);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.files.map((f: { name: string }) => f.name)).toEqual(['evidence-package.json']);
    expect(manifest.files[0].bytes).toBe(new TextEncoder().encode('{"packageVersion":1}').length);
    expect(manifest.loop.loopId).toBe('A');
    expect(manifest.window).toMatchObject({ kind: '12h', endUtc: END });
    expect(manifest.run).toMatchObject({ result: 'Original', methodRunIds: { G15: 'run-g15' } });
    expect(manifest.engine.calculationVersion).toBe('3.0.0');
    expect(manifest.note).toMatch(/not.*sufficien/i);
    expect(await zip.file('evidence-package.json')!.async('string')).toBe('{"packageVersion":1}');
  });
});

describe('PackageDialog', () => {
  beforeEach(() => {
    vi.mocked(exportsMod.evidencePackage).mockReset();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  const dialog = () => render(<PackageDialog open onClose={() => {}} loopId="A" row={win} series="root.x.A" timeZone="UTC" />);

  it('lists what the package holds, and downloads one zip of that window', async () => {
    vi.mocked(exportsMod.evidencePackage).mockResolvedValue('{"packageVersion":1}');
    dialog();
    expect(screen.getByText('manifest.json')).toBeTruthy();
    expect(screen.getByText('evidence-package.json')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).toBeInstanceOf(Blob);
    const [ctx, w, series] = vi.mocked(exportsMod.evidencePackage).mock.calls[0];
    expect(ctx).toMatchObject({ loopId: 'A', series: 'root.x.A' });
    expect(w).toBe(win);
    expect(series).toBe('root.x.A');
  });

  it('says why when the package could not be built', async () => {
    vi.mocked(exportsMod.evidencePackage).mockRejectedValue(new Error('historian down'));
    dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(await screen.findByText(/Evidence package failed: historian down/)).toBeTruthy();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
