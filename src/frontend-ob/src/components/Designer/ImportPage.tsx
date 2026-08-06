'use client';

// Import an AVEVA PI Vision display (.pdix) as an AMS display.
//
// Flow: choose/drop a file → parse locally (JSZip, no upload) → review what mapped, what didn't, and a
// real preview of the result → name it → save. Symbols that don't map to an OpenBridge symbol are
// listed for manual mapping; they are never silently dropped.
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importPdix, type ImportedDisplay } from '../../services/import/pdixImport';
import { apiFetch } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { renderThumbnailSvg } from './thumbnail';
import { ObiFileUploadGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-file-upload-google';
import { ObiError } from '@oicl/openbridge-webcomponents-react/icons/icon-error';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
// The .import-page__* rules live here. This file never imported it, so the whole page rendered as
// unstyled default HTML — a bare "Choose File" button on a white page.
import './Designer.css';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const ImportPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user?.username ?? 'unknown');
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportedDisplay | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const parse = async (f: File) => {
    setError(null);
    setResult(null);
    setFile(f);
    setBusy(true);
    try {
      // NOTE: this used to pass `demoLiveTag: 'houston/crude1/pump101.speed'`, which silently REBOUND
      // the first value symbol of whatever display you imported to a Houston pump tag and appended
      // "(live)" to its label. That was a Phase-I gate demo, and it corrupted every real import. An
      // import must reproduce the source display faithfully — bind tags in the designer afterwards.
      const r = await importPdix(f);
      setResult(r);
      setName(r.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void parse(f);
  };

  const save = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      // Both responses are checked. If the content PUT failed, the user used to be navigated into the
      // newly-created EMPTY display and told nothing — the whole import silently lost.
      const createRes = await apiFetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || result.name, category: 'imported', ownerId: user }),
      });
      if (!createRes.ok) throw new Error(`Could not create the display (${createRes.status})`);
      const created = await createRes.json();
      if (!created?.id) throw new Error('The display service did not return an id');

      // Stamp the import time onto the persisted report (the importer stays clock-free).
      const settings = result.settings.importReport
        ? { ...result.settings, importReport: { ...result.settings.importReport, importedAt: new Date().toISOString() } }
        : result.settings;

      const contentRes = await apiFetch(`${API_BASE}/${created.id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot: { items: result.items, settings },
          changeNote: `Imported from ${file?.name ?? 'PI Vision'}`,
          userId: user,
        }),
      });
      if (!contentRes.ok) {
        throw new Error(`The display was created but the imported content could not be saved (${contentRes.status}). Nothing was imported.`);
      }
      navigate(`/designer/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // The same schematic the display cards use — so "what you'll get" is shown, not described.
  const previewSvg = useMemo(() => {
    if (!result) return '';
    return renderThumbnailSvg({
      items: result.items,
      width: result.settings.canvasWidth,
      height: result.settings.canvasHeight,
      background: result.settings.backgroundColor,
    });
  }, [result]);

  const mappedTypes = useMemo(
    () => (result ? Object.entries(result.stats).sort((a, b) => b[1] - a[1]) : []),
    [result],
  );
  const mappedCount = result ? result.items.length - result.unmapped.length : 0;

  return (
    <div className="import-page">
      <header className="import-page__head">
        <button className="import-page__back" onClick={() => navigate('/designer')}>
          <ObiChevronLeftGoogle /> Displays
        </button>
        <div>
          <h2 className="import-page__title">Import from AVEVA PI Vision</h2>
          <p className="import-page__hint">
            Upload a <code>.pdix</code> display export. It is parsed in your browser — nothing is uploaded
            until you save. Symbols with no OpenBridge equivalent are listed for manual mapping, never
            silently dropped.
          </p>
        </div>
      </header>

      {/* ── Drop zone ─────────────────────────────────────────────────────── */}
      <div
        className={`import-drop${dragging ? ' import-drop--over' : ''}${busy && !result ? ' import-drop--busy' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        data-testid="pdix-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdix,.zip"
          onChange={e => { const f = e.target.files?.[0]; if (f) void parse(f); }}
          data-testid="pdix-input"
          hidden
        />
        <span className="import-drop__icon"><ObiFileUploadGoogle /></span>
        {busy && !result ? (
          <span className="import-drop__title">Parsing {file?.name}…</span>
        ) : file && result ? (
          <>
            <span className="import-drop__title">{file.name}</span>
            <span className="import-drop__sub">{fmtBytes(file.size)} · click or drop to replace</span>
          </>
        ) : (
          <>
            <span className="import-drop__title">Drop a .pdix file here, or click to browse</span>
            <span className="import-drop__sub">AVEVA PI Vision display export</span>
          </>
        )}
      </div>

      {error && (
        <div className="import-alert import-alert--error" data-testid="import-error">
          <ObiError />
          <span>{error}</span>
        </div>
      )}

      {/* ── Review ────────────────────────────────────────────────────────── */}
      {result && (
        <div className="import-page__result" data-testid="import-result">
          <div className="import-stats">
            <div className="import-stat">
              <span className="import-stat__value">{result.items.length}</span>
              <span className="import-stat__label">Symbols found</span>
            </div>
            <div className="import-stat">
              <span className="import-stat__value import-stat__value--ok">{mappedCount}</span>
              <span className="import-stat__label">Mapped automatically</span>
            </div>
            <div className="import-stat">
              <span className={`import-stat__value${result.unmapped.length ? ' import-stat__value--warn' : ''}`}>
                {result.unmapped.length}
              </span>
              <span className="import-stat__label">Need manual mapping</span>
            </div>
            <div className="import-stat">
              <span className="import-stat__value">
                {result.settings.canvasWidth}×{result.settings.canvasHeight}
              </span>
              <span className="import-stat__label">Canvas size</span>
            </div>
          </div>

          <div className="import-grid">
            {/* Preview — show what you'll get, don't describe it */}
            <section className="import-card import-card--preview">
              <h3 className="import-card__title">Preview</h3>
              <div
                className="import-preview"
                data-testid="import-preview"
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
              <p className="import-card__note">
                Schematic of the imported layout. Open it in the designer to bind tags and refine.
              </p>
            </section>

            <section className="import-card">
              <h3 className="import-card__title">Mapped symbol types</h3>
              <ul className="import-types">
                {mappedTypes.map(([t, n]) => (
                  <li key={t} className="import-types__row">
                    <span className="import-types__name">{t}</span>
                    <span className="import-types__count">{n}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="import-card">
              <h3 className="import-card__title" data-testid="unmapped-count">
                Needs manual mapping ({result.unmapped.length})
              </h3>
              {result.unmapped.length === 0 ? (
                <p className="import-card__ok">
                  <ObiCheckGoogle /> Every symbol mapped cleanly.
                </p>
              ) : (
                <>
                  <p className="import-card__note">
                    Imported as labelled placeholders — nothing was dropped. Replace them in the designer.
                  </p>
                  <ul className="import-unmapped">
                    {result.unmapped.slice(0, 50).map(u => (
                      <li key={u.id} className="import-unmapped__row">
                        <span className="import-pill">{u.piType}</span>
                        <span className="import-unmapped__name" title={u.reason}>{u.name}</span>
                        {u.ref && <span className="import-unmapped__ref" title={u.ref}>{u.ref}</span>}
                      </li>
                    ))}
                  </ul>
                  {result.unmapped.length > 50 && (
                    <p className="import-card__note">…and {result.unmapped.length - 50} more.</p>
                  )}
                </>
              )}
            </section>
          </div>

          {/* ── Save ────────────────────────────────────────────────────── */}
          <div className="import-save">
            <label className="import-save__field">
              <span>Display name</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={result.name}
                data-testid="import-name"
              />
            </label>
            <div className="import-save__actions">
              <button
                className="import-btn"
                onClick={() => navigate('/designer')}
                disabled={busy}
              >Cancel</button>
              <button
                className="import-btn import-btn--primary"
                onClick={save}
                disabled={busy || !name.trim()}
                data-testid="import-save"
              >
                {busy ? 'Saving…' : 'Save as display'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportPage;
