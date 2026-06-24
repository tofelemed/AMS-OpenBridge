'use client';

import React from 'react';
import { useAlarmStore } from '../../store/alarmStore';
import { formatTimestampMs } from '../../utils/time';
import { useLiveEventsPanel } from '../../context/LiveEventsContext';

export const LiveEventStream: React.FC = () => {
  const events = useAlarmStore(s => s.recentSoeEvents);
  const recentEvents = events.slice(0, 50);
  const { toggleLiveEvents } = useLiveEventsPanel();

  return (
    <>
      <div className="events-header">
        <span>Live Events</span>
        <button
          type="button"
          className="events-header__toggle"
          onClick={toggleLiveEvents}
          aria-label="Hide live events panel"
          title="Hide live events panel"
        >
          Hide ◂
        </button>
      </div>
      <div className="events-list">
        {recentEvents.length === 0 ? (
          <div className="events-empty">
            Waiting for live events...
          </div>
        ) : (
          recentEvents.map((event, index) => (
            <div
              key={`${event.id}-${index}`}
              className={`event-item ${
                event.priority === 'CRITICAL' ? 'event-item--alarm' :
                event.priority === 'HIGH' ? 'event-item--warning' : ''
              }`}
            >
              <div className="event-item__time">
                {formatTimestampMs(event.sourceTimestampEpochMs)}
              </div>
              <div className="event-item__source">{event.sourceName}</div>
              <div className="event-item__message">{event.message}</div>
              {event.isOutOfOrder && (
                <div style={{ fontSize: '10px', color: 'var(--alert-caution-border-color)', marginTop: '2px' }}>
                  ⚠ Late arrival corrected
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
};
