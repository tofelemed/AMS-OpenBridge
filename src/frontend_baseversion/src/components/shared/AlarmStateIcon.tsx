import React from 'react';
import { ActiveAlarm } from '../../store/alarmStore';
import { motion, AnimatePresence } from 'framer-motion';

interface AlarmStateIconProps {
  alarm: ActiveAlarm;
}

export const AlarmStateIcon: React.FC<AlarmStateIconProps> = ({ alarm }) => {
  const { acknowledged, conditionActive, isShelved, isSuppressed, isOutOfService, ackLifecycleState } = alarm;

  let state = 'ARCHIVED';
  let color = 'var(--text-muted)';
  let bg = 'rgba(100, 116, 139, 0.15)'; // grey

  if (isOutOfService) {
    state = 'OUT OF SERVICE';
    color = '#9ca3af'; // Grayish
    bg = 'rgba(156, 163, 175, 0.2)';
  } else if (isShelved) {
    state = 'SHELVED';
    color = '#60a5fa'; // Blue
    bg = 'rgba(96, 165, 250, 0.15)';
  } else if (isSuppressed) {
    state = 'SUPPRESSED';
    color = '#c084fc'; // Purple
    bg = 'rgba(192, 132, 252, 0.15)';
  } else if (conditionActive && !acknowledged) {
    state = 'NEW';
    color = '#ff1744'; // Red — unacknowledged active alarm
    bg = 'rgba(255, 23, 68, 0.15)';
  } else if (conditionActive && acknowledged) {
    // Distinguish UI-originated ACK from external OPC ACK.
    // External ACKs have no ackLifecycleState (no commandId from this application).
    const isExternal = !ackLifecycleState || ackLifecycleState === '';
    state = isExternal ? 'EXT. ACK' : 'ACKED';
    color = '#ff9100'; // Amber — acknowledged, still active
    bg = 'rgba(255, 145, 0, 0.15)';
  } else if (!conditionActive && !acknowledged) {
    state = 'CLEARED'; // RTN — return to normal
    color = '#00e676'; // Green
    bg = 'rgba(0, 230, 118, 0.15)';
  } else {
    state = 'CLEARED'; // RTN+ACK — effectively cleared before archiving
    color = '#00e676'; // Green
    bg = 'rgba(0, 230, 118, 0.15)';
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px 6px',
          borderRadius: '3px',
          background: bg,
          border: `1px solid ${color}40`,
          color: color,
          fontSize: '9px',
          fontWeight: 800,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          animation: state === 'NEW' ? 'pulse-bg-critical 2s infinite' : 'none',
          boxShadow: state === 'NEW' ? '0 0 4px rgba(255, 23, 68, 0.4)' : 'none'
        }}
      >
        {state}
      </motion.div>
    </AnimatePresence>
  );
};
