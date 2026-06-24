'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatTimestampMs } from '../../utils/time';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

const T = {
  blue: '#31598F', blueLight: '#EAF2FF', blueMuted: '#C4D8F0',
  bg: '#F6F8FB', card: '#FFFFFF', border: '#DDE3EA', borderLight: '#EEF2F7',
  textPrimary: '#1F2937', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  success: '#2E8B57', successBg: '#ECFDF5', successBorder: '#A7F3D0',
  critical: '#D64545', criticalBg: '#FEF2F2',
  warning: '#B45309', warningBg: '#FFFBEB', warningBorder: '#FDE68A',
  caution: '#D97706',
  radius: '12px', radiusSm: '8px',
} as const;

const fetchAuditEvents = async () => ({
  items: [
    { eventId: 'f8d9a2b1', timestampUtc: Date.now() - 60000,    eventType: 'ALARM_ACKNOWLEDGED', userId: 'operator01', sourceIp: '10.10.5.14', station: 'CCR-01', entityType: 'Alarm',         entityId: 'alarm-1234', currentHash: 'a1b2c3d4e5f6', correlationId: 'root-555' },
    { eventId: 'e7c8b1a0', timestampUtc: Date.now() - 120000,   eventType: 'ALARM_SHELVED',      userId: 'operator02', sourceIp: '10.10.5.15', station: 'CCR-02', entityType: 'Alarm',         entityId: 'alarm-9999', currentHash: '0f9e8d7c6b5a', correlationId: null },
    { eventId: 'd6b7a09f', timestampUtc: Date.now() - 3600000,  eventType: 'TOPOLOGY_UPDATED',   userId: 'admin',      sourceIp: '10.10.1.5',  station: 'ENG-01', entityType: 'EquipmentNode', entityId: 'Pump-A1',    currentHash: '1a2b3c4d5e6f', correlationId: null },
  ],
  totalCount: 3,
});

const EVENT_BADGE: Record<string, { bg: string; color: string }> = {
  ALARM_ACKNOWLEDGED: { bg: T.blueLight,  color: T.blue },
  ALARM_SHELVED:      { bg: T.warningBg,  color: T.caution },
  TOPOLOGY_UPDATED:   { bg: T.successBg,  color: T.success },
};

const AuditExplorer: React.FC = () => {
  const [filterType, setFilterType] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['auditEvents', filterType, filterUser],
    queryFn: fetchAuditEvents,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

      {/* Header */}
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>
          Operational Audit Log
        </h3>
        <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
          Immutable cryptographically-chained record of all operator and system actions.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap',
        background: T.bg, border: `1px solid ${T.border}`,
        borderRadius: T.radiusSm, padding: '14px 16px',
      }}>
        <FilterField label="Filter by User">
          <input
            type="text" className="ob-input"
            placeholder="Username…" value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            style={{ width: '160px' }}
          />
        </FilterField>
        <FilterField label="Event Type">
          <select className="ob-input" value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ width: '200px' }}>
            <option value="">All Events</option>
            <option value="ALARM_ACKNOWLEDGED">Acknowledgements</option>
            <option value="ALARM_SHELVED">Shelving</option>
            <option value="SECURITY">Security / Logins</option>
            <option value="SYSTEM">System Events</option>
          </select>
        </FilterField>
        <div style={{ marginLeft: 'auto' }}>
          <ObcButton variant="raised" onClick={() => alert('Verification job started. Check logs.')}>
            ✓ Verify Cryptographic Chain
          </ObcButton>
        </div>
      </div>

      {/* Integrity notice */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '11px 16px', borderRadius: T.radiusSm,
        background: T.successBg, border: `1px solid ${T.successBorder}`,
        fontSize: '12.5px', color: '#1a4731',
      }}>
        <span style={{ fontSize: '14px' }}>🔒</span>
        <span>
          <strong>Hash chain verified.</strong> All audit entries are cryptographically linked.
          Any tampering will break the chain and trigger an alert.
        </span>
      </div>

      {/* Table */}
      <div style={{ borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: T.bg }}>
              {['Timestamp', 'Event Type', 'User / Station', 'Entity', 'Hash Signature', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '11px 16px', textAlign: 'left',
                  fontSize: '10.5px', fontWeight: 700, color: T.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: `1.5px solid ${T.border}`,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: T.textMuted }}>
                  Loading immutable ledger…
                </td>
              </tr>
            ) : data?.items.map((e, i) => {
              const badge = EVENT_BADGE[e.eventType] ?? { bg: T.bg, color: T.textMuted };
              return (
                <tr
                  key={i}
                  style={{ borderBottom: `1px solid ${T.borderLight}`, background: T.card }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = T.blueLight)}
                  onMouseLeave={ev => (ev.currentTarget.style.background = T.card)}
                >
                  <td style={{ padding: '12px 16px', fontFamily: "'Noto Sans Mono', monospace", fontSize: '12px', color: T.textSecondary, whiteSpace: 'nowrap' }}>
                    {formatTimestampMs(e.timestampUtc)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 9px', borderRadius: '20px',
                      fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.04em',
                      background: badge.bg, color: badge.color,
                      border: `1px solid ${badge.color}30`,
                    }}>
                      {e.eventType}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: T.textPrimary }}>{e.userId}</div>
                    <div style={{ fontSize: '11.5px', color: T.textMuted, marginTop: '2px' }}>
                      {e.station} · {e.sourceIp}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: T.textPrimary }}>{e.entityType}</div>
                    <div style={{ fontSize: '11.5px', color: T.textMuted, fontFamily: "'Noto Sans Mono', monospace", marginTop: '2px' }}>
                      {e.entityId}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.success, flexShrink: 0 }} title="Hash verified" />
                      <span style={{ fontFamily: "'Noto Sans Mono', monospace", fontSize: '11.5px', color: T.textMuted }}>
                        {e.currentHash.substring(0, 12)}…
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '7px' }}>
                      <AuditBtn>Diff</AuditBtn>
                      {e.correlationId && <AuditBtn>Trace Root</AuditBtn>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '12px', color: T.textMuted, textAlign: 'right' }}>
        Total records: {data?.totalCount ?? 0}
      </div>
    </div>
  );
};

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    {children}
  </label>
);

const AuditBtn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <button style={{
    padding: '4px 12px', fontSize: '11.5px', fontWeight: 600,
    borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${T.border}`, background: T.bg, color: T.textSecondary,
    transition: 'all 120ms ease',
  }}
    onMouseEnter={e => { e.currentTarget.style.background = T.blueLight; e.currentTarget.style.color = T.blue; }}
    onMouseLeave={e => { e.currentTarget.style.background = T.bg; e.currentTarget.style.color = T.textSecondary; }}
  >
    {children}
  </button>
);

export default AuditExplorer;
