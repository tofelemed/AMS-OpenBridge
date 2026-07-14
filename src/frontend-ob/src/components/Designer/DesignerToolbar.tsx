'use client';

// The Designer's toolbar.
//
// It used to be 31 controls crammed into ONE non-wrapping 48px row (~1600px intrinsic width in a
// ~1420px space, so it overflowed at 1920px), every one an unlabelled emoji/glyph — including two
// different meanings for "⬆" (bring-to-front AND publish), and 5 undecodable align glyphs (⊢ ≑ ⊣ ⊤ ⊥).
//
// Now: a document bar (what the display IS: name, mode, save, publish) and a context bar (what you're
// DOING to it: history, arrange, zoom, view), grouped with dividers, the rarely-used actions folded
// into menus. Icons are OpenBridge `Obi*` only; where the library has no icon (zoom, align, group,
// flip, publish) the control is a text-labelled button rather than an invented glyph.
import React, { useEffect, useRef, useState } from 'react';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiEditGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-edit-google';
import { ObiMediaPlay } from '@oicl/openbridge-webcomponents-react/icons/icon-media-play';
import { ObiContentExpandGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-expand-google';
import { ObiContentCollapseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-collapse-google';
import { ObiSaveProposal } from '@oicl/openbridge-webcomponents-react/icons/icon-save-proposal';
import { ObiFileUploadGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-file-upload-google';
import { ObiMoreVerticalGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-more-vertical-google';
import { ObiUndoIec } from '@oicl/openbridge-webcomponents-react/icons/icon-undo-iec';
import { ObiRedoIec } from '@oicl/openbridge-webcomponents-react/icons/icon-redo-iec';
import { ObiArrowUpGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-arrow-up-google';
import { ObiArrowDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-arrow-down-google';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import { ObiIdTag } from '@oicl/openbridge-webcomponents-react/icons/icon-id-tag';
import { relativeTime, absoluteTime } from '../../utils/relativeTime';

export type AlignDir = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';

interface DisplayMeta {
  draftVersion: number;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

interface ToolbarProps {
  name: string;
  isDirty: boolean;
  mode: 'design' | 'preview';
  setMode: (m: 'design' | 'preview') => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  onBack: () => void;

  zoom: number;
  setZoom: (z: number) => void;
  fitToScreen: () => void;

  histIndex: number;
  histLen: number;
  undo: () => void;
  redo: () => void;

  selectedCount: number;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (d: AlignDir) => void;
  onSameSize: () => void;
  onZOrder: (d: 'front' | 'back') => void;
  onFlip: (a: 'H' | 'V') => void;

  trendCount: number;
  onTrend: () => void;

  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  showAssets: boolean;
  toggleAssets: () => void;

  canvasSize: { width: number; height: number };
  setCanvasSize: (s: { width: number; height: number }) => void;

  onSave: () => void;
  saving: boolean;

  canPublish: boolean;
  meta?: DisplayMeta;
  hasUnpublishedChanges: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onRevert: () => void;
  publishing: boolean;
}

/** Small dropdown; closes on outside click or Escape. */
const Menu: React.FC<{ label: React.ReactNode; title?: string; disabled?: boolean; testId?: string; children: (close: () => void) => React.ReactNode }> =
({ label, title, disabled, testId, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="dt-menu" ref={ref}>
      <button
        className={`dt-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
      >
        {label}
        <ObiChevronDownGoogle className="dt-caret" />
      </button>
      {open && <div className="dt-menu__pop" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
};

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export const DesignerToolbar: React.FC<ToolbarProps> = (p) => {
  const canArrange = p.selectedCount >= 2;
  const hasSel = p.selectedCount >= 1;

  return (
    <div className="designer-toolbar">
      {/* ── Document bar: what this display IS ───────────────────────────── */}
      <div className="dt-row dt-row--doc">
        <button className="dt-btn" onClick={p.onBack} title="Back to displays" data-testid="designer-back" aria-label="Back">
          <ObiChevronLeftGoogle /> Back
        </button>

        <span className="dt-title" title={p.name}>
          {p.name}
          {p.isDirty && <span className="dt-dirty" title="Unsaved changes" />}
        </span>

        <span className="dt-spacer" />

        <div className="dt-seg" role="group" aria-label="Editor mode">
          <button
            className={`dt-btn${p.mode === 'design' ? ' active' : ''}`}
            onClick={() => p.setMode('design')}
            aria-pressed={p.mode === 'design'}
          ><ObiEditGoogle /> Design</button>
          <button
            className={`dt-btn${p.mode === 'preview' ? ' active' : ''}`}
            onClick={() => p.setMode('preview')}
            aria-pressed={p.mode === 'preview'}
            data-testid="preview-btn"
          ><ObiMediaPlay /> Preview</button>
        </div>

        <button
          className="dt-btn"
          onClick={p.toggleFullscreen}
          title={p.isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
          aria-label="Toggle full screen"
          data-testid="fullscreen-btn"
        >
          {p.isFullscreen ? <ObiContentCollapseGoogle /> : <ObiContentExpandGoogle />}
        </button>

        <span className="dt-div" />

        <button
          className="dt-btn dt-btn--primary"
          onClick={p.onSave}
          disabled={p.saving || !p.isDirty}
          title="Save (Ctrl+S)"
          data-testid="save-btn"
        >
          <ObiSaveProposal /> {p.saving ? 'Saving…' : 'Save'}
        </button>

        {p.canPublish && (
          <div className="dt-split">
            <button
              className="dt-btn dt-btn--primary"
              onClick={p.onPublish}
              disabled={p.publishing || p.isDirty}
              title={p.isDirty ? 'Save first, then publish' : 'Publish the current draft to the runtime'}
              data-testid="publish-btn"
            >
              <ObiFileUploadGoogle /> Publish
            </button>
            {/* Unpublish and Revert are rare + destructive: out of the hot path, into the menu. */}
            <Menu label="" title="Publish options" testId="publish-menu">
              {close => (
                <>
                  <button
                    className="dt-item"
                    data-testid="unpublish-btn"
                    disabled={!p.meta?.publishedVersion}
                    onClick={() => { close(); p.onUnpublish(); }}
                  >Unpublish — withdraw from the runtime</button>
                  <button
                    className="dt-item dt-item--danger"
                    data-testid="revert-btn"
                    disabled={!p.meta?.publishedVersion}
                    onClick={() => { close(); p.onRevert(); }}
                  >Revert — discard unpublished edits</button>
                </>
              )}
            </Menu>
          </div>
        )}

        <span className="dt-version" data-testid="version-badges">
          Draft v{p.meta?.draftVersion ?? '–'}
          {' · '}
          {p.meta?.publishedVersion
            ? (
              <span
                className="dt-badge dt-badge--pub"
                data-testid="published-at"
                title={`Published ${absoluteTime(p.meta.publishedAt)}${p.meta.publishedBy ? ` by ${p.meta.publishedBy}` : ''}`}
              >
                Published v{p.meta.publishedVersion} · {relativeTime(p.meta.publishedAt)}
                {p.meta.publishedBy ? ` by ${p.meta.publishedBy}` : ''}
              </span>
            )
            : <span className="dt-badge dt-badge--unpub">Not published</span>}
          {p.hasUnpublishedChanges && (
            <span className="dt-badge dt-badge--dirty" data-testid="unpublished-badge">unpublished changes</span>
          )}
        </span>

        <Menu label={<ObiMoreVerticalGoogle />} title="More" testId="overflow-menu">
          {close => (
            <>
              <div className="dt-item dt-item--static">
                Canvas size
                <span className="dt-size">
                  <input
                    type="number" value={p.canvasSize.width} min={320} max={7680}
                    onChange={e => p.setCanvasSize({ ...p.canvasSize, width: Number(e.target.value) || p.canvasSize.width })}
                    aria-label="Canvas width"
                  />
                  ×
                  <input
                    type="number" value={p.canvasSize.height} min={240} max={4320}
                    onChange={e => p.setCanvasSize({ ...p.canvasSize, height: Number(e.target.value) || p.canvasSize.height })}
                    aria-label="Canvas height"
                  />
                </span>
              </div>
              <button className="dt-item" onClick={() => { close(); p.fitToScreen(); }}>Fit to screen</button>
              <div className="dt-item dt-item--static dt-shortcuts">
                <strong>Shortcuts</strong>
                <span>Ctrl+S save · Ctrl+Z/Y undo/redo · Ctrl+D duplicate</span>
                <span>Ctrl+C/V copy/paste · Ctrl+G group · Ctrl+A select all</span>
                <span>Arrows nudge · Shift+Arrows ×10 · Del delete · Esc deselect</span>
                <span>Ctrl+wheel zoom · Space+drag pan</span>
              </div>
            </>
          )}
        </Menu>
      </div>

      {/* ── Context bar: what you're DOING (design mode only) ────────────── */}
      {p.mode === 'design' && (
        <div className="dt-row dt-row--context">
          <button className="dt-btn" onClick={p.undo} disabled={p.histIndex <= 0} title="Undo (Ctrl+Z)" aria-label="Undo">
            <ObiUndoIec />
          </button>
          <button className="dt-btn" onClick={p.redo} disabled={p.histIndex >= p.histLen - 1} title="Redo (Ctrl+Y)" aria-label="Redo">
            <ObiRedoIec />
          </button>

          <span className="dt-div" />

          <button className="dt-btn" onClick={p.onGroup} disabled={!canArrange} title="Group (Ctrl+G)">Group</button>
          <button className="dt-btn" onClick={p.onUngroup} disabled={!hasSel} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>

          {/* 6 aligns + same-size only apply to a multi-selection — they don't deserve 7 permanent slots */}
          <Menu label="Align" title="Align & distribute" disabled={!canArrange} testId="align-menu">
            {close => (
              <>
                <button className="dt-item" data-testid="align-left" onClick={() => { close(); p.onAlign('left'); }}>Align left</button>
                <button className="dt-item" onClick={() => { close(); p.onAlign('centerH'); }}>Align centre (horizontal)</button>
                <button className="dt-item" onClick={() => { close(); p.onAlign('right'); }}>Align right</button>
                <button className="dt-item" data-testid="align-top" onClick={() => { close(); p.onAlign('top'); }}>Align top</button>
                {/* centerV was implemented but had NO button — it was unreachable */}
                <button className="dt-item" onClick={() => { close(); p.onAlign('centerV'); }}>Align centre (vertical)</button>
                <button className="dt-item" onClick={() => { close(); p.onAlign('bottom'); }}>Align bottom</button>
                <button className="dt-item" onClick={() => { close(); p.onSameSize(); }}>Make same size</button>
              </>
            )}
          </Menu>

          <button className="dt-btn" onClick={() => p.onZOrder('front')} disabled={!hasSel} title="Bring to front" aria-label="Bring to front">
            <ObiArrowUpGoogle />
          </button>
          <button className="dt-btn" onClick={() => p.onZOrder('back')} disabled={!hasSel} title="Send to back" aria-label="Send to back">
            <ObiArrowDownGoogle />
          </button>
          <button className="dt-btn" onClick={() => p.onFlip('H')} disabled={!hasSel} title="Flip horizontal">Flip H</button>
          <button className="dt-btn" onClick={() => p.onFlip('V')} disabled={!hasSel} title="Flip vertical">Flip V</button>

          <span className="dt-div" />

          <button className="dt-btn" onClick={() => p.setZoom(Math.max(0.25, p.zoom - 0.25))} title="Zoom out" aria-label="Zoom out">−</button>
          <Menu label={`${Math.round(p.zoom * 100)}%`} title="Zoom" testId="zoom-menu">
            {close => (
              <>
                {ZOOM_STEPS.map(z => (
                  <button key={z} className="dt-item" onClick={() => { close(); p.setZoom(z); }}>{Math.round(z * 100)}%</button>
                ))}
                <button className="dt-item" data-testid="fit-btn" onClick={() => { close(); p.fitToScreen(); }}>Fit to screen</button>
              </>
            )}
          </Menu>
          <button className="dt-btn" onClick={() => p.setZoom(Math.min(3, p.zoom + 0.25))} title="Zoom in" aria-label="Zoom in">+</button>
          <button className="dt-btn" onClick={p.fitToScreen} title="Fit the display to the window" data-testid="fit-toolbar-btn">Fit</button>

          <span className="dt-div" />

          <label className="dt-check">
            <input type="checkbox" checked={p.showGrid} onChange={e => p.setShowGrid(e.target.checked)} />
            Grid
          </label>
          {/* Snapping used to be unconditional — nothing could be placed off-grid. Alt bypasses it for
              a single drag without turning the setting off (PI Vision's affordance). */}
          <label className="dt-check" title="Snap to grid — hold Alt while dragging to bypass">
            <input
              type="checkbox" data-testid="snap-toggle"
              checked={p.snapEnabled}
              onChange={e => p.setSnapEnabled(e.target.checked)}
            />
            Snap
          </label>
          <button
            className={`dt-btn${p.showAssets ? ' active' : ''}`}
            onClick={p.toggleAssets}
            title="Asset browser (bind tags)"
            aria-label="Asset browser"
            aria-pressed={p.showAssets}
          >
            <ObiIdTag /> Tags
          </button>
          <button
            className="dt-btn"
            onClick={p.onTrend}
            disabled={p.trendCount === 0}
            title={p.trendCount ? `Trend ${p.trendCount} tag(s) from the selection` : 'Select symbol(s) with a bound tag'}
            data-testid="trend-action"
          >
            <ObiTrend /> Trend{p.trendCount ? ` (${p.trendCount})` : ''}
          </button>

          <span className="dt-spacer" />
          <span className="dt-hint">{p.selectedCount ? `${p.selectedCount} selected` : 'Drag a symbol onto the canvas'}</span>
        </div>
      )}
    </div>
  );
};

export default DesignerToolbar;
