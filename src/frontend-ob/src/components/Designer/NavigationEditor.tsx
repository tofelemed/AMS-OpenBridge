'use client';

// Navigation-link authoring (PI Vision's "Add Navigation Link" pane).
//
// The runtime has honored `navigationLink` since Phase D — clicking a symbol opens another display,
// passes the asset, and even renders a popup faceplate. But there was NO authoring UI anywhere, so a
// multi-screen HMI simply could not be built in this designer. This is that UI.
//
// Benchmarked against PI Vision 2025 (its .pdix wire schema: LinkURL / NewTab / IncludeAsset /
// IncludeTimeRange) and ISA-101 (L1 overview → L2 area → L3 detail → L4 faceplate, ≤3 clicks from L1;
// L4 delivered as popups — which is why we keep an `openMode: 'popup'` PI Vision doesn't have).
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CanvasItem, NavigationLink } from './types';
import { TagPicker } from './AssetBrowser';
import { apiJson } from '../../api/apiFetch';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface DisplayOption { id: string; name: string; category: string; hierarchyPath?: string }

/**
 * Only https:// or a same-origin relative path. PI Vision enforces exactly this by default and it is a
 * real security control, not a nicety: an HMI symbol that can be pointed at `javascript:` or an
 * arbitrary http:// host is an injection vector on a control-room screen.
 */
export function isSafeUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true;    // same-origin relative
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

interface Props {
  item: CanvasItem;
  onChange: (link: NavigationLink | undefined) => void;
}

export const NavigationEditor: React.FC<Props> = ({ item, onChange }) => {
  const link = item.navigationLink;
  const [search, setSearch] = useState('');

  // The chosen action is explicit state, seeded from the saved link. Deriving it from the link's
  // contents alone would snap back to "Nothing" the moment you picked "Open a display" — because a
  // freshly-created link has no target yet, so the picker would never appear.
  type Action = 'none' | 'display' | 'url';
  const initialAction: Action = link?.targetDisplayId ? 'display' : link?.targetUrl != null ? 'url' : 'none';
  const [action, setAction] = useState<Action>(initialAction);
  // Re-seed when the selection changes to a different symbol.
  const [seededFor, setSeededFor] = useState(item.id);
  if (seededFor !== item.id) {
    setSeededFor(item.id);
    setAction(initialAction);
  }

  // Without this, a display-service outage renders an EMPTY target picker —
  // indistinguishable from "this deployment has no displays".
  const { data: displays, isError: displaysError } = useQuery({
    queryKey: ['nav-displays', search],
    queryFn: () => apiJson<{ displays: DisplayOption[] }>(
      `${API_BASE}?take=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    enabled: action === 'display',
  });

  // A symbol with no binding of its own (rectangle, text, hotspot) cannot pass "its" asset — there
  // isn't one. PI Vision handles this by making you drop an explicit asset on the symbol; so do we.
  const hasOwnBinding = useMemo(
    () => Object.values(item.bindings ?? {}).some(v => typeof v === 'string' && v.includes('/')),
    [item.bindings],
  );

  const patch = (p: Partial<NavigationLink>) => onChange({ ...(link ?? {}), ...p });
  const mode = link?.assetContextMode ?? 'none';
  const urlInvalid = action === 'url' && !!link?.targetUrl && !isSafeUrl(link.targetUrl);

  return (
    <div className="property-inspector__content" data-testid="nav-editor">
      <div className="property-section">
        <div className="property-section__title">On click</div>
        <div className="property-row">
          <select
            className="property-input"
            data-testid="nav-action"
            value={action}
            onChange={e => {
              const v = e.target.value as Action;
              setAction(v);
              if (v === 'none') onChange(undefined);
              else if (v === 'display') onChange({ openMode: 'replace', assetContextMode: hasOwnBinding ? 'current-asset' : 'none' });
              else onChange({ openMode: 'new-tab', targetUrl: '' });
            }}
          >
            <option value="none">Nothing</option>
            <option value="display">Open a display</option>
            <option value="url">Open a URL</option>
          </select>
        </div>
      </div>

      {action === 'display' && (
        <>
          <div className="property-section">
            <div className="property-section__title">Target display</div>
            <input
              className="property-input"
              placeholder="Search displays…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="nav-search"
            />
            <div className="nav-picker" role="listbox">
              {(displays?.displays ?? []).map(d => (
                <button
                  key={d.id}
                  className={`nav-picker__item${link?.targetDisplayId === d.id ? ' active' : ''}`}
                  data-testid="nav-target"
                  role="option"
                  aria-selected={link?.targetDisplayId === d.id}
                  onClick={() => patch({ targetDisplayId: d.id, targetUrl: undefined, label: d.name })}
                >
                  <span className="nav-picker__name">{d.name}</span>
                  <span className="nav-picker__meta">{d.hierarchyPath || d.category}</span>
                </button>
              ))}
              {displaysError && (
                <div className="property-hint" role="status">
                  Display list unavailable — the service did not answer. This is not an
                  empty deployment.
                </div>
              )}
              {!displaysError && displays && displays.displays.length === 0 && (
                <div className="property-hint">No displays match.</div>
              )}
            </div>
          </div>

          <div className="property-section">
            <div className="property-section__title">Open in</div>
            <select
              className="property-input"
              data-testid="nav-openmode"
              value={link?.openMode ?? 'replace'}
              onChange={e => patch({ openMode: e.target.value as NavigationLink['openMode'] })}
            >
              <option value="replace">This tab (replace)</option>
              <option value="new-tab">New tab</option>
              {/* ISA-101 wants Level-4 detail/faceplates as popups. PI Vision has no such mode; we do. */}
              <option value="popup">Popup faceplate (ISA-101 Level 4)</option>
            </select>
          </div>

          <div className="property-section">
            <div className="property-section__title">Asset context</div>
            <select
              className="property-input"
              data-testid="nav-assetmode"
              value={mode}
              onChange={e => patch({ assetContextMode: e.target.value as NavigationLink['assetContextMode'] })}
            >
              <option value="none">Don't pass an asset</option>
              <option value="current-asset" disabled={!hasOwnBinding}>
                Use this symbol's asset{hasOwnBinding ? '' : ' — symbol has no binding'}
              </option>
              <option value="current-asset-as-root" disabled={!hasOwnBinding}>
                Use this symbol's asset as the root (include its children)
              </option>
              <option value="explicit">Use a specific asset…</option>
            </select>

            {mode === 'explicit' && (
              <div className="property-row" data-testid="nav-explicit-asset">
                <TagPicker
                  value={link?.assetContext ?? ''}
                  onChange={(path: string) => patch({ assetContext: path })}
                />
              </div>
            )}
            <div className="property-hint">
              {mode === 'current-asset' && 'A pump tile on an overview opens the pump detail for that pump.'}
              {mode === 'current-asset-as-root' && 'The target resolves this asset and its children (e.g. turbine → gearbox, generator).'}
              {mode === 'explicit' && 'Fixed asset — use this for shapes/hotspots drawn over a P&ID, which have no binding of their own.'}
            </div>

            <label className="property-checkbox">
              <input
                type="checkbox"
                checked={!!link?.includeTimeRange}
                onChange={e => patch({ includeTimeRange: e.target.checked })}
              />
              <span>Pass the current time range</span>
            </label>
          </div>
        </>
      )}

      {action === 'url' && (
        <div className="property-section">
          <div className="property-section__title">URL</div>
          <input
            className={`property-input${urlInvalid ? ' property-input--invalid' : ''}`}
            data-testid="nav-url"
            placeholder="https://…"
            value={link?.targetUrl ?? ''}
            onChange={e => patch({ targetUrl: e.target.value, targetDisplayId: undefined })}
          />
          {urlInvalid && (
            <div className="property-hint property-hint--error" data-testid="nav-url-error">
              Only https:// or a same-origin path is allowed.
            </div>
          )}
          <label className="property-checkbox">
            <input
              type="checkbox"
              checked={link?.openMode === 'new-tab'}
              onChange={e => patch({ openMode: e.target.checked ? 'new-tab' : 'replace' })}
            />
            <span>Open in a new tab</span>
          </label>
        </div>
      )}

      {action !== 'none' && (
        <div className="property-section">
          <div className="property-hint">
            Links only fire in Preview / the runtime viewer — in Design mode a click always selects.
          </div>
        </div>
      )}
    </div>
  );
};

export default NavigationEditor;
