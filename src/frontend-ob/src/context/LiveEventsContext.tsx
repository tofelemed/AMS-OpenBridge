'use client';

import { createContext, useContext } from 'react';

interface LiveEventsContextValue {
  showLiveEvents: boolean;
  toggleLiveEvents: () => void;
}

export const LiveEventsContext = createContext<LiveEventsContextValue>({
  showLiveEvents: true,
  toggleLiveEvents: () => {},
});

export const useLiveEventsPanel = () => useContext(LiveEventsContext);
