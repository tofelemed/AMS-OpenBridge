import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlarmStore, ActiveAlarm } from '../../store/alarmStore';
import { AlarmStateIcon } from './AlarmStateIcon';
import { isDisplayableOpcAlarm, isActiveOpcAlarm, sortAlarmsForConsole } from '../../utils/opcAlarmFilter';

export const LiveEventStream: React.FC = () => {
  const alarms = useAlarmStore(s => s.alarms);
  const lastUpdated = useAlarmStore(s => s.lastUpdated);
  const [events, setEvents] = useState<ActiveAlarm[]>([]);
  const topSigRef = useRef('');

  useEffect(() => {
    const sorted = Array.from(alarms.values())
      .filter(a => isDisplayableOpcAlarm(a) && isActiveOpcAlarm(a))  // OPC A&E: only active conditions
      .sort(sortAlarmsForConsole)
      .slice(0, 50);

    const sig = sorted.slice(0, 5).map(a => `${a.id}:${a.eventTimeEpochMs}`).join('|');
    if (sig === topSigRef.current) return;
    topSigRef.current = sig;
    setEvents(sorted);
  }, [alarms, lastUpdated]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h3 style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
        }}>
          Live Event Stream
        </h3>
        <span style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--alarm-critical)',
          boxShadow: '0 0 8px var(--alarm-critical)',
          animation: 'flash-text 2s infinite',
        }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-3)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '23px', width: '2px', background: 'var(--color-border)', zIndex: 0 }} />
        <AnimatePresence initial={false}>
          {events.map((alarm) => {
            const color = alarm.priority === 'CRITICAL' ? 'var(--alarm-critical)'
              : alarm.priority === 'HIGH' ? 'var(--alarm-high)'
              : alarm.priority === 'MEDIUM' ? 'var(--alarm-medium)' : 'var(--alarm-low)';

            return (
              <motion.div
                key={`${alarm.id}-${alarm.eventTimeEpochMs}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  position: 'relative',
                  paddingLeft: 'var(--space-6)',
                  marginBottom: 'var(--space-4)',
                  zIndex: 1,
                }}
              >
                <div style={{
                  position: 'absolute',
                  left: '6px',
                  top: '4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 8px ${color}80`,
                  border: '2px solid var(--color-bg-secondary)',
                }} />

                <div style={{
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderTop: `2px solid ${color}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                        {new Date(alarm.eventTimeEpochMs).toISOString().split('T')[1].replace('Z', '')}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                        {alarm.sourceName}:{alarm.conditionName}
                      </span>
                    </div>
                    <AlarmStateIcon alarm={alarm} />
                  </div>

                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>
                    {alarm.message ?? ''}
                    {alarm.subConditionName ? ` (${alarm.subConditionName})` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
                    <span style={{ background: 'var(--color-bg-tertiary)', color: 'var(--text-muted)', fontSize: '9px', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>
                      PRI: {alarm.priority}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
