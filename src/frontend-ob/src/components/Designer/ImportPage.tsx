'use client';

// Phase I — PI Vision import UI. Upload a .pdix, preview the parsed result + any symbols that
// didn't map cleanly (surfaced for manual mapping, never dropped), then save as an AMS display.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importPdix, type ImportedDisplay } from '../../services/import/pdixImport';
import { apiFetch } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

export const ImportPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user?.username ?? 'unknown');   // real owner, not the literal 'importer'
  const [result, setResult] = useState<ImportedDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null); setResult(null); setBusy(true);
    try {
      // demoLiveTag: prove imported symbols can bind to live data
      const r = await importPdix(f, { demoLiveTag: 'houston/crude1/pump101.speed' });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!result) return;
    setBusy(true);
    try {
      // Both responses used to be ignored. If the content PUT failed, the user was still navigated into
      // the newly-created EMPTY display and told nothing — the whole import was silently lost. If the
      // POST failed, `created.id` was undefined → PUT /displays/undefined/content → /designer/undefined.
      const createRes = await apiFetch(API_BASE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.name, category: 'imported', ownerId: user }),
      });
      if (!createRes.ok) throw new Error(`Could not create the display (${createRes.status})`);
      const created = await createRes.json();
      if (!created?.id) throw new Error('The display service did not return an id');

      const contentRes = await apiFetch(`${API_BASE}/${created.id}/content`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: { items: result.items, settings: result.settings }, changeNote: 'PI Vision import', userId: user }),
      });
      if (!contentRes.ok) {
        throw new Error(`The display was created but the imported content could not be saved (${contentRes.status}). Nothing was imported.`);
      }
      navigate(`/designer/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="import-page">
      <h2 className="import-page__title">Import from AVEVA PI Vision</h2>
      <p className="import-page__hint">Upload a <code>.pdix</code> display export. Symbols that don't map to an
        OpenBridge symbol are listed below for manual mapping — they are never silently dropped.</p>

      <label className="import-page__drop">
        <input type="file" accept=".pdix,.zip" onChange={onFile} data-testid="pdix-input" />
        <span>{busy ? 'Parsing…' : 'Choose a .pdix file'}</span>
      </label>

      {error && <div className="import-page__error">⚠ {error}</div>}

      {result && (
        <div className="import-page__result" data-testid="import-result">
          <div className="import-page__summary">
            <strong>{result.name}</strong>
            <span>{result.items.length} items · {result.settings.canvasWidth}×{result.settings.canvasHeight}</span>
          </div>

          <div className="import-page__cols">
            <div>
              <h4>Mapped symbol types</h4>
              <table className="import-page__table"><tbody>
                {Object.entries(result.stats).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                  <tr key={t}><td>{t}</td><td>{n}</td></tr>
                ))}
              </tbody></table>
            </div>
            <div>
              <h4 data-testid="unmapped-count">Needs manual mapping ({result.unmapped.length})</h4>
              <div className="import-page__unmapped">
                {result.unmapped.slice(0, 40).map(u => (
                  <div key={u.id} className="import-page__unmapped-row">
                    <span className="import-page__pill">{u.piType}</span>
                    <span>{u.name}</span>
                    {u.ref && <span className="import-page__ref">{u.ref}</span>}
                  </div>
                ))}
                {result.unmapped.length > 40 && <div>…and {result.unmapped.length - 40} more</div>}
              </div>
            </div>
          </div>

          <div className="import-page__actions">
            <button className="import-page__save" onClick={save} disabled={busy} data-testid="import-save">
              {busy ? 'Saving…' : 'Save as display →'}
            </button>
            <button onClick={() => navigate('/designer')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportPage;
