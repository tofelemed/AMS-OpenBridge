import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Asset } from './types';
import { ASSET_TYPE_ICONS, ASSET_TYPE_LABELS } from './types';
import { apiFetch } from '../../api/apiFetch';

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
  
  // Search results
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['assets', 'search', searchTerm],
    queryFn: () => searchAssets(searchTerm),
    enabled: searchTerm.length >= 2,
    staleTime: 30_000
  });
  
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

// Compact tag picker for property inspector
export const TagPicker: React.FC<{
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: searchResults } = useQuery({
    queryKey: ['assets', 'search', searchTerm],
    queryFn: () => searchAssets(searchTerm),
    enabled: isOpen && searchTerm.length >= 2,
    staleTime: 30_000
  });
  
  const handleSelect = (asset: Asset) => {
    onChange(asset.contextualPath);
    setIsOpen(false);
    setSearchTerm('');
  };
  
  return (
    <div className="tag-picker">
      <div className="tag-picker__input-wrapper">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'Enter tag path or browse...'}
          className="tag-picker__input"
        />
        <button
          type="button"
          className="tag-picker__browse"
          onClick={() => setIsOpen(!isOpen)}
          title="Browse assets"
        >
          📂
        </button>
      </div>
      
      {isOpen && (
        <div className="tag-picker__dropdown">
          <input
            type="text"
            placeholder="Search tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="tag-picker__search"
            autoFocus
          />
          
          <div className="tag-picker__results">
            {searchResults && searchResults.length > 0 ? (
              searchResults.slice(0, 10).map(asset => (
                <button
                  key={asset.id}
                  className="tag-picker__result"
                  onClick={() => handleSelect(asset)}
                >
                  <span className="tag-picker__result-icon">
                    {ASSET_TYPE_ICONS[asset.type]}
                  </span>
                  <span className="tag-picker__result-name">{asset.name}</span>
                  <span className="tag-picker__result-path">{asset.contextualPath}</span>
                </button>
              ))
            ) : searchTerm.length >= 2 ? (
              <div className="tag-picker__no-results">No tags found</div>
            ) : (
              <div className="tag-picker__hint">Type to search tags</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetBrowser;
