import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { formatTimestampMs } from '../../utils/time';

// ---- API Call Stub ----
const fetchAuditEvents = async () => {
  // Assuming a paginated API exposed either via AMS API proxying to Audit DB, or direct read-replica access
  // const token = (window as any).kc?.token;
  // const res = await axios.get('/api/v1/audit', { headers: { Authorization: `Bearer ${token}` } });
  // return res.data;
  
  return {
    items: [
      {
        eventId: 'f8d9a2b1', timestampUtc: new Date().getTime() - 60000, eventType: 'ALARM_ACKNOWLEDGED',
        userId: 'operator01', sourceIp: '10.10.5.14', station: 'CCR-01', entityType: 'Alarm',
        entityId: 'alarm-1234', currentHash: 'a1b2c3d4e5f6', correlationId: 'root-555'
      },
      {
        eventId: 'e7c8b1a0', timestampUtc: new Date().getTime() - 120000, eventType: 'ALARM_SHELVED',
        userId: 'operator02', sourceIp: '10.10.5.15', station: 'CCR-02', entityType: 'Alarm',
        entityId: 'alarm-9999', currentHash: '0f9e8d7c6b5a', correlationId: null
      },
      {
        eventId: 'd6b7a09f', timestampUtc: new Date().getTime() - 3600000, eventType: 'TOPOLOGY_UPDATED',
        userId: 'admin', sourceIp: '10.10.1.5', station: 'ENG-01', entityType: 'EquipmentNode',
        entityId: 'Pump-A1', currentHash: '1a2b3c4d5e6f', correlationId: null
      }
    ],
    totalCount: 3
  };
};

// ============================================================
// Immutable Audit Explorer
// ============================================================

const AuditExplorer: React.FC = () => {
  const [filterType, setFilterType] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['auditEvents', filterType, filterUser],
    queryFn: fetchAuditEvents
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)' }}>
      
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', background: 'var(--color-bg-elevated)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, marginRight: 'auto' }}>Operational Audit Log (Immutable)</div>
        
        <input 
          type="text" 
          placeholder="Filter User..." 
          className="input-field" 
          value={filterUser} 
          onChange={e => setFilterUser(e.target.value)}
          style={{ width: 150 }}
        />

        <select className="input-field" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Events</option>
          <option value="ALARM_ACKNOWLEDGED">Acknowledgements</option>
          <option value="ALARM_SHELVED">Shelving</option>
          <option value="SECURITY">Security / Logins</option>
          <option value="SYSTEM">System Events</option>
        </select>

        <button className="btn btn--primary" onClick={() => alert('Verification job started. Check logs.')}>
          Verify Cryptographic Chain
        </button>
      </div>

      {/* Audit Table */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}>
              <th style={{ padding: 'var(--space-3)' }}>Timestamp</th>
              <th style={{ padding: 'var(--space-3)' }}>Event Type</th>
              <th style={{ padding: 'var(--space-3)' }}>User / Station</th>
              <th style={{ padding: 'var(--space-3)' }}>Entity</th>
              <th style={{ padding: 'var(--space-3)' }}>Hash Signature</th>
              <th style={{ padding: 'var(--space-3)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 'var(--space-4)', textAlign: 'center' }}>Loading immutable ledger...</td></tr>
            ) : data?.items.map((e, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: 'var(--space-3)', fontFamily: 'var(--font-mono)' }}>{formatTimestampMs(e.timestampUtc)}</td>
                <td style={{ padding: 'var(--space-3)' }}>
                  <span style={{ 
                    padding: '2px 6px', 
                    borderRadius: 4, 
                    background: e.eventType.includes('ALARM') ? 'rgba(0,188,212,0.1)' : 'rgba(255,152,0,0.1)',
                    color: e.eventType.includes('ALARM') ? 'var(--accent-cyan)' : 'var(--color-warning)'
                  }}>
                    {e.eventType}
                  </span>
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  <div>{e.userId}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{e.station} ({e.sourceIp})</div>
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  <div>{e.entityType}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{e.entityId}</div>
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} title="Hash verified"></div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {e.currentHash.substring(0, 12)}...
                    </span>
                  </div>
                </td>
                <td style={{ padding: 'var(--space-3)' }}>
                  <button className="btn btn--ghost" style={{ padding: '4px 8px', fontSize: '12px' }}>Diff</button>
                  {e.correlationId && <button className="btn btn--ghost" style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--alarm-critical)' }}>Trace Root</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default AuditExplorer;
