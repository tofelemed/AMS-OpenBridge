// Task 18: the Evidence package is a real zip: a manifest naming every file and every part, and the window's evidence package.
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
const GOOD = JSON.stringify({ packageVersion: 1, metrics: { x: 1 }, evidence: { manifests: { m: 1 } } });
const base = { loopId: 'A', displayName: 'Feed', row: win, timeZone: 'UTC', exported: '2026-10-06T00:00:00Z' };

afterEach(cleanup);

describe('buildEvidenceZip', () => {
  it('holds manifest.json that names every file and part, and the evidence package itself', async () => {
    const { bytes, parts } = await buildEvidenceZip({ ...base, packageJson: GOOD });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(['evidence-package.json', 'manifest.json']);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.files.map((f: { name: string }) => f.name)).toEqual(['evidence-package.json']);
    expect(manifest.files[0].bytes).toBe(new TextEncoder().encode(GOOD).length);
    expect(manifest.files[0].parts.map((p: { part: string; status: string }) => `${p.part}:${p.status}`)).toEqual([
      'verdict and every gate:included', 'metrics:included', 'evidence manifests:included', 'signal samples:included']);
    expect(parts.every(p => p.status === 'included')).toBe(true);
    expect(manifest.loop.loopId).toBe('A');
    expect(manifest.window).toMatchObject({ kind: '12h', endUtc: END });
    expect(manifest.run).toMatchObject({ result: 'Original', methodRunIds: { G15: 'run-g15' } });
    expect(manifest.engine.calculationVersion).toBe('3.0.0');
    expect(manifest.note).toMatch(/not.*sufficien/i);
    expect(await zip.file('evidence-package.json')!.async('string')).toBe(GOOD);
  });

  it('names a part whose read failed, and one that is not held, instead of claiming it', async () => {
    const json = JSON.stringify({ metrics: { error: 'Error: 503' }, evidence: { manifests: null } });
    const { bytes, parts } = await buildEvidenceZip({ ...base, packageJson: json });
    const manifest = JSON.parse(await (await JSZip.loadAsync(bytes)).file('manifest.json')!.async('string'));
    const by = Object.fromEntries(manifest.files[0].parts.map((p: { part: string }) => [p.part, p]));
    expect(by['metrics']).toMatchObject({ status: 'failed', detail: 'Error: 503' });
    expect(by['evidence manifests']).toMatchObject({ status: 'none held' });
    expect(parts.map(p => p.part)).toEqual(['metrics', 'evidence manifests']);
  });
});

describe('PackageDialog', () => {
  beforeEach(() => {
    vi.mocked(exportsMod.evidencePackage).mockReset();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  const dialog = (onClose = () => {}) => render(<PackageDialog open onClose={onClose} loopId="A" row={win} series="root.x.A" timeZone="UTC" />);

  it('downloads one zip of that window, passing a cancel signal', async () => {
    vi.mocked(exportsMod.evidencePackage).mockResolvedValue(GOOD);
    dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).toBeInstanceOf(Blob);
    const [ctx, w, series, signal] = vi.mocked(exportsMod.evidencePackage).mock.calls[0];
    expect(ctx).toMatchObject({ loopId: 'A', series: 'root.x.A' });
    expect(w).toBe(win);
    expect(series).toBe('root.x.A');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(screen.queryByText(/not complete/)).toBeNull();
  });

  it('says what is missing when a part could not be read', async () => {
    vi.mocked(exportsMod.evidencePackage).mockResolvedValue(JSON.stringify({ metrics: { error: 'Error: 503' }, evidence: { manifests: {} } }));
    dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(await screen.findByText(/Downloaded, but not complete: metrics could not be read \(Error: 503\)/)).toBeTruthy();
  });

  it('says why when the package could not be built', async () => {
    vi.mocked(exportsMod.evidencePackage).mockRejectedValue(new Error('historian down'));
    dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }));
    expect(await screen.findByText(/Evidence package failed: historian down/)).toBeTruthy();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('cancels a build in progress when the dialog is closed: no download fires', async () => {
    let release: (v: string) => void = () => {};
    vi.mocked(exportsMod.evidencePackage).mockImplementation(() => new Promise<string>(r => { release = r; }));
    const onClose = vi.fn();
    dialog(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Download package' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect((vi.mocked(exportsMod.evidencePackage).mock.calls[0][3] as AbortSignal).aborted).toBe(true);
    release(GOOD);
    await new Promise(r => setTimeout(r, 30));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
