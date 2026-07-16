import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Asset } from './types';
import { ASSET_TYPE_ICONS, ASSET_TYPE_LABELS } from './types';
import { apiFetch } from '../../api/apiFetch';
import { hasWildcard, literalPart, matchesTerm } from '../../utils/glob';

const ASSET_API = import.meta.env.VITE_ASSET_MODEL_URL || '/api/assets';

interface AssetBrowserProps {
  onSelectPath: (path: string, asset: Asset) => void;
  selectedPath?: string;
  mode?: 'browser' | 'picker';
  filterType?: number; // Only show assets of this type
}

// Tree node type used for expandable asset hierarchy
// interface AssetTreeNode extends Asset {
//   children?: AssetTreeNode[];
//   isExpanded?: boolean;
//   isLoading?: boolean;
// }

async function fetchAssets(parentId?: string): Promise<Asset[]> {
  const url = parentId 
    ? `${ASSET_API}?parentId=${parentId}`
    : `${ASSET_API}?type=1`; // Start with sites
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to fetch assets');
  const data = await res.json();
  return data.assets || [];
}

async function fetchAssetChildren(assetId: string): Promise<Asset[]> {
  const url = `${ASSET_API}/${assetId}/children`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to fetch children');
  const data = await res.json();
  return data.children || [];
}

async function searchAssets(query: string): Promise<Asset[]> {
  const url = `${ASSET_API}?search=${encodeURIComponent(query)}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to search');
  const data = await res.json();
  return data.assets || [];
}

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
  onSelectPath,
  selectedPath,
  mode = 'browser',
  filterType
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Record<string, Asset[]>>({});
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  
  // Fetch root assets (sites)
  const { data: rootAssets, isLoading: isLoadingRoot } = useQuery({
    queryKey: ['assets', 'root'],
    queryFn: () => fetchAssets(),
    staleTime: 60_000
  });
  
  // Search results. Phase 8 (O8/O9): a wildcard term (pump*, temp?) is sent to the server as its longest
  // literal run (a substring pre-filter), then narrowed CLIENT-SIDE by the glob across name/path/desc.
  const serverTerm = hasWildcard(searchTerm) ? literalPart(searchTerm) : searchTerm;
  const { data: rawSearchResults, isLoading: isSearching } = useQuery({
    queryKey: ['assets', 'search', serverTerm],
    queryFn: () => searchAssets(serverTerm),
    enabled: searchTerm.length >= 2,
    staleTime: 30_000
  });
  const searchResults = React.useMemo(
    () => (rawSearchResults ?? []).filter(a => matchesTerm(searchTerm, a.name, a.contextualPath, a.description)),
    [rawSearchResults, searchTerm],
  );
  
  const loadChildren = useCallback(async (assetId: string) => {
    if (childrenCache[assetId] || loadingNodes.has(assetId)) return;
    
    setLoadingNodes(prev => new Set(prev).add(assetId));
    try {
      const children = await fetchAssetChildren(assetId);
      setChildrenCache(prev => ({ ...prev, [assetId]: children }));
    } catch (err) {
      console.error('Failed to load children:', err);
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  }, [childrenCache, loadingNodes]);
  
  const toggleExpand = useCallback((assetId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
        loadChildren(assetId);
      }
      return next;
    });
  }, [loadChildren]);
  
  const handleSelect = (asset: Asset) => {
    onSelectPath(asset.contextualPath, asset);
  };
  
  const renderAssetNode = (asset: Asset, level: number = 0) => {
    const isExpanded = expandedNodes.has(asset.id);
    const isLoading = loadingNodes.has(asset.id);
    const children = childrenCache[asset.id] || [];
    const hasChildren = asset.type < 5; // Measurements don't have children
    const isSelected = selectedPath === asset.contextualPath;
    const typeIcon = ASSET_TYPE_ICONS[asset.type] || '📄';
    
    if (filterType && asset.type !== filterType) {
      return null;
    }
    
    return (
      <div key={asset.id} className="asset-node">
        <div
          className={`asset-node__row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          // Measurements are draggable onto the canvas — drop on empty space to create a bound value
          // readout, or onto a symbol to add the tag to it (B18/B19/O13).
          draggable={asset.type === 5}
          onDragStart={asset.type === 5 ? (e) => {
            e.dataTransfer.setData('application/x-ams-tag', asset.contextualPath);
            e.dataTransfer.effectAllowed = 'copy';
          } : undefined}
        >
          {hasChildren ? (
            <button
              className="asset-node__expand"
              onClick={() => toggleExpand(asset.id)}
            >
              {isLoading ? '⏳' : isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="asset-node__expand-placeholder" />
          )}
          
          <span className="asset-node__icon">{typeIcon}</span>
          
          <button
            className="asset-node__label"
            onClick={() => handleSelect(asset)}
            title={asset.contextualPath}
          >
            <span className="asset-node__name">{asset.name}</span>
            {asset.engineeringUnit && (
              <span className="asset-node__unit">[{asset.engineeringUnit}]</span>
            )}
          </button>
          
          {asset.type === 5 && (
            <button
              className="asset-node__select-btn"
              onClick={() => handleSelect(asset)}
              title="Use this tag"
            >
              ✓
            </button>
          )}
        </div>
        
        {isExpanded && children.length > 0 && (
          <div className="asset-node__children">
            {children.map(child => renderAssetNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };
  
  const renderSearchResult = (asset: Asset) => {
    const typeIcon = ASSET_TYPE_ICONS[asset.type] || '📄';
    const typeLabel = ASSET_TYPE_LABELS[asset.type] || 'Unknown';
    const isSelected = selectedPath === asset.contextualPath;
    
    return (
      <div
        key={asset.id}
        className={`asset-search-result ${isSelected ? 'selected' : ''}`}
        onClick={() => handleSelect(asset)}
        // A measurement found via search is just as draggable as one found in the tree (B18/B19/O13):
        // drop on empty canvas to create a bound value readout, or onto a symbol to add the tag.
        draggable={asset.type === 5}
        onDragStart={asset.type === 5 ? (e) => {
          e.dataTransfer.setData('application/x-ams-tag', asset.contextualPath);
          e.dataTransfer.effectAllowed = 'copy';
        } : undefined}
      >
        <span className="asset-search-result__icon">{typeIcon}</span>
        <div className="asset-search-result__info">
          <div className="asset-search-result__name">{asset.name}</div>
          <div className="asset-search-result__path">{asset.contextualPath}</div>
        </div>
        <span className="asset-search-result__type">{typeLabel}</span>
        {asset.engineeringUnit && (
          <span className="asset-search-result__unit">{asset.engineeringUnit}</span>
        )}
      </div>
    );
  };
  
  return (
    <div className={`asset-browser ${mode === 'picker' ? 'asset-browser--picker' : ''}`}>
      <div className="asset-browser__header">
        <h4>🏷️ {mode === 'picker' ? 'Select Tag' : 'Asset Browser'}</h4>
      </div>
      
      <div className="asset-browser__search">
        <input
          type="text"
          placeholder="Search assets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="asset-browser__search-clear" onClick={() => setSearchTerm('')}>
            ✕
          </button>
        )}
      </div>
      
      {selectedPath && (
        <div className="asset-browser__selected">
          <span className="asset-browser__selected-label">Selected:</span>
          <code className="asset-browser__selected-path">{selectedPath}</code>
        </div>
      )}
      
      <div className="asset-browser__tree">
        {searchTerm.length >= 2 ? (
          // Search results
          isSearching ? (
            <div className="asset-browser__loading">Searching...</div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="asset-browser__search-results">
              {searchResults.map(renderSearchResult)}
            </div>
          ) : (
            <div className="asset-browser__empty">No assets found</div>
          )
        ) : (
          // Tree view
          isLoadingRoot ? (
            <div className="asset-browser__loading">Loading assets...</div>
          ) : rootAssets && rootAssets.length > 0 ? (
            rootAssets.map(asset => renderAssetNode(asset))
          ) : (
            <div className="asset-browser__empty">
              No assets configured.
              <br />
              <small>Add assets via the Asset Model service.</small>
            </div>
          )
        )}
      </div>
      
      <div className="asset-browser__legend">
        {Object.entries(ASSET_TYPE_ICONS).map(([type, icon]) => (
          <span key={type} className="asset-browser__legend-item">
            {icon} {ASSET_TYPE_LABELS[Number(type)]}
          </span>
        ))}
      </div>
    </div>
  );
};

// Compact tag picker for property inspector.
//
// UX (revised): the main input IS the search box — typing ≥2 chars shows a live typeahead dropdown of
// matching tags directly beneath it (no folder-click-first). The 📂 button opens a full hierarchy
// *browse* tree (the AssetBrowser in picker mode) for users who prefer to navigate rather than search.
// Both paths call onChange(contextualPath). Wildcards (pump*, temp?) are honoured like the AssetBrowser.
export const TagPicker: React.FC<{
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [focused, setFocused] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // Typeahead is driven by whatever is currently in the input. A wildcard term is pre-filtered
  // server-side by its longest literal run, then narrowed client-side by the glob (mirrors AssetBrowser).
  const term = value.trim();
  const serverTerm = hasWildcard(term) ? literalPart(term) : term;
  const { data: rawResults, isFetching } = useQuery({
    queryKey: ['assets', 'search', serverTerm],
    queryFn: () => searchAssets(serverTerm),
    enabled: focused && !browseOpen && term.length >= 2,
    staleTime: 30_000,
  });
  const results = React.useMemo(
    () => (rawResults ?? []).filter(a => matchesTerm(term, a.name, a.contextualPath, a.description)),
    [rawResults, term],
  );
  // Don't pop the typeahead when the input already holds an exact path the user selected.
  const isExactMatch = results.length === 1 && results[0].contextualPath === term;
  const showTypeahead = focused && !browseOpen && term.length >= 2 && !isExactMatch;

  const handleSelect = (asset: Asset) => {
    onChange(asset.contextualPath);
    setFocused(false);
    setBrowseOpen(false);
  };

  // Close both popups on an outside click.
  React.useEffect(() => {
    if (!focused && !browseOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setFocused(false);
        setBrowseOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [focused, browseOpen]);

  return (
    <div className="tag-picker" ref={wrapRef}>
      <div className="tag-picker__input-wrapper">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { setFocused(true); setBrowseOpen(false); }}
          placeholder={placeholder || 'Type to search, or browse →'}
          className="tag-picker__input"
        />
        {value && (
          <button
            type="button"
            className="tag-picker__clear"
            onMouseDown={(e) => { e.preventDefault(); onChange(''); }}
            title="Clear tag"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          className={`tag-picker__browse${browseOpen ? ' active' : ''}`}
          onClick={() => { setBrowseOpen(o => !o); setFocused(false); }}
          title="Browse asset tree"
        >
          📂
        </button>
      </div>

      {/* Typeahead — live results as you type in the input above. */}
      {showTypeahead && (
        <div className="tag-picker__dropdown">
          <div className="tag-picker__results">
            {results.length > 0 ? (
              results.slice(0, 12).map(asset => (
                <button
                  key={asset.id}
                  type="button"
                  className="tag-picker__result"
                  // onMouseDown fires before the input's blur, so the pick registers.
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(asset); }}
                >
                  <span className="tag-picker__result-icon">
                    {ASSET_TYPE_ICONS[asset.type]}
                  </span>
                  <span className="tag-picker__result-name">{asset.name}</span>
                  <span className="tag-picker__result-path">{asset.contextualPath}</span>
                  {asset.engineeringUnit && (
                    <span className="tag-picker__result-unit">{asset.engineeringUnit}</span>
                  )}
                </button>
              ))
            ) : isFetching ? (
              <div className="tag-picker__hint">Searching…</div>
            ) : (
              <div className="tag-picker__no-results">No tags found</div>
            )}
          </div>
        </div>
      )}

      {/* Browse — full hierarchy tree (sites → units → devices → measurements). */}
      {browseOpen && (
        <div className="tag-picker__dropdown tag-picker__dropdown--browse">
          <AssetBrowser
            mode="picker"
            selectedPath={value}
            onSelectPath={(_path, asset) => handleSelect(asset)}
          />
        </div>
      )}
    </div>
  );
};

export default AssetBrowser;
