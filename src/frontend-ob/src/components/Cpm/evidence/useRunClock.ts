/**
 * CHG-188 (owner review 10.2, 15): the two clocks of a run dialog. While the run is in flight the dialog re-renders each second,
 * so the time since the click (and a time limit) stays current; once it is Done, "Done" stays on screen briefly and then the
 * dialog closes by itself.
 */
import { useEffect, useRef, useState } from 'react';
import { DONE_CLOSE_MS } from './runPhase';

/** Re-renders the caller every `everyMs` while `active`. */
export function useTick(active: boolean, everyMs = 1000): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setTick(n => n + 1), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
}

/** Calls `onDone` once, `delayMs` after `done` turns true; never when `done` turns false first. */
export function useAfterDone(done: boolean, onDone: () => void, delayMs = DONE_CLOSE_MS): void {
  const latest = useRef(onDone);
  latest.current = onDone;
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => latest.current(), delayMs);
    return () => clearTimeout(t);
  }, [done, delayMs]);
}
