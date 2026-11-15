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

/** CHG-193: true once `ms` have passed since `from` (false while `from` is null); re-renders the caller at that moment. */
export function useDeadline(from: number | null, ms: number): boolean {
  const [, setPassed] = useState(0);
  const past = from != null && Date.now() - from >= ms;
  useEffect(() => {
    if (from == null || past) return undefined;
    const t = setTimeout(() => setPassed(n => n + 1), from + ms - Date.now());
    return () => clearTimeout(t);
  }, [from, ms, past]);
  return past;
}

/** CHG-193: re-renders the caller at each whole minute while `active` (at most once a minute). */
export function useMinuteTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let t: ReturnType<typeof setTimeout>;
    const arm = () => { t = setTimeout(() => { setTick(n => n + 1); arm(); }, 60_000 - (Date.now() % 60_000)); };
    arm();
    return () => clearTimeout(t);
  }, [active]);
}
