import React, { useState, useEffect } from 'react';
import { Search, Info, PlayCircle } from 'lucide-react';
import { useAlarmStore } from '../../store/alarmStore';
import { HubConnectionBuilder } from '@microsoft/signalr';

export const AlarmLifecycleInspector: React.FC = () => {
    const alarms = useAlarmStore(s => s.alarms);
    const [search, setSearch] = useState('');
    const [deltas, setDeltas] = useState<any[]>([]);

    useEffect(() => {
        const hubUrl = '/hubs/observability';
        const connection = new HubConnectionBuilder()
          .withUrl(hubUrl)
          .withAutomaticReconnect()
          .build();

        connection.on('OnAlarmStateDeltaReceived', (payload) => {
            setDeltas(prev => [payload, ...prev].slice(0, 100));
        });

        connection.start().catch(err => console.error("Observability Hub error", err));

        return () => {
            connection.stop();
        };
    }, []);

    const filteredAlarms = Array.from(alarms.values()).filter(a => 
        a.id.includes(search) || a.conditionName?.includes(search) || a.sourceName?.includes(search)
    ).slice(0, 10);

    return (
        <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Alarm Lifecycle Inspector</h3>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                        type="text" 
                        placeholder="Search Correlation ID..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '4px 8px 4px 28px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '12px' }}
                    />
                </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '12px', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--text-muted)' }}>
                            <th style={{ paddingBottom: '8px' }}>Timestamp</th>
                            <th style={{ paddingBottom: '8px' }}>Correlation ID</th>
                            <th style={{ paddingBottom: '8px' }}>Change Type</th>
                            <th style={{ paddingBottom: '8px' }}>State Preview</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deltas.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    No state changes captured from Flink.
                                </td>
                            </tr>
                        ) : deltas.filter(d => d.correlation_id.includes(search)).map((d, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--color-bg-secondary)' }}>
                                <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>{new Date(d.timestamp).toLocaleTimeString()}</td>
                                <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{d.correlation_id}</td>
                                <td>
                                    <span style={{ 
                                        padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                                        background: d.change_type === 'INSERT' ? 'var(--color-success)' : 
                                                    d.change_type === 'REMOVE' ? 'var(--alarm-high)' : 'var(--color-warning)',
                                        color: d.change_type === 'UPDATE' ? '#000' : '#fff'
                                    }}>
                                        {d.change_type}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '11px' }}>
                                        {JSON.stringify(d.current_state || d.previous_state)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
