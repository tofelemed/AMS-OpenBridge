import React from 'react';
import { toast } from 'react-toastify';

interface AlarmToolbarProps {
  gridRef: any;
  selectedIds: Set<string>;
  quickFilter: string;
  onQuickFilterChange: (val: string) => void;
  onAcknowledge: () => void;
  onShelve: () => void;
  isFrozen: boolean;
  onToggleFreeze: () => void;
}

export const AlarmToolbar: React.FC<AlarmToolbarProps> = ({
  gridRef,
  selectedIds,
  quickFilter,
  onQuickFilterChange,
  onAcknowledge,
  onShelve,
  isFrozen,
  onToggleFreeze,
}) => {
  const clearSelection = () => {
    gridRef.current?.api?.deselectAll();
  };

  const handleExport = () => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `ams_active_alarms_${Date.now()}.csv`
      });
      toast.info("Exported active alarms to CSV.");
    } else {
      toast.error("Grid is not ready for export.");
    }
  };

  return (
    <div className="alarm-toolbar">
      {/* Search / filter */}
      <div className="alarm-toolbar__search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          id="alarm-quick-filter"
          type="text"
          placeholder="Filter by Source, Message, Condition..."
          value={quickFilter}
          onChange={(e) => onQuickFilterChange(e.target.value)}
          className="alarm-toolbar__search-input"
        />
        {quickFilter && (
          <button
            onClick={() => onQuickFilterChange('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
              fontSize: '12px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="alarm-toolbar__actions">
        {selectedIds.size > 0 && (
          <span className="alarm-toolbar__selection-badge">
            <span className="alarm-toolbar__selection-count">{selectedIds.size}</span>
            Selected
          </span>
        )}

        <button
          onClick={onToggleFreeze}
          className={`btn ${isFrozen ? 'btn--critical' : 'btn--ghost'}`}
          style={{ fontSize: '12px', padding: '6px 14px', marginRight: '8px' }}
        >
          {isFrozen ? '❄️ Frozen' : '⏸️ Freeze'}
        </button>

        <button
          id="btn-acknowledge"
          onClick={onAcknowledge}
          disabled={selectedIds.size === 0}
          className={`btn ${selectedIds.size > 0 ? 'btn--primary' : 'btn--ghost'}`}
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Acknowledge
          <kbd className="toolbar-kbd">F2</kbd>
        </button>

        <button
          id="btn-shelve"
          onClick={onShelve}
          disabled={selectedIds.size === 0}
          className="btn btn--ghost"
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          <span style={{ fontSize: '13px' }}>📥</span>
          Shelve
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={clearSelection}
            className="btn btn--ghost"
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            Clear
            <kbd className="toolbar-kbd">Esc</kbd>
          </button>
        )}

        <div className="alarm-toolbar__divider" />

        <button
          id="btn-export"
          onClick={handleExport}
          className="btn btn--ghost"
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>
    </div>
  );
};
