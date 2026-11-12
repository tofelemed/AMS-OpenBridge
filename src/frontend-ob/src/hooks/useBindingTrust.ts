/**
 * CHG-176: the Designer's binding trust in React (rules in ./bindingTrust).
 *
 * The loop signals are read ONLY when a fallback binding has appeared: a display that never sees one creates no query
 * observer and sends no request. CHG-179: they come from GET /loops/signal-paths (display.view OR analytics.view), so
 * operators get the loop exception too; one query (`['cpm','loop-signal-paths']`) is cached and shared by every symbol
 * on the display. The read is marked quiet (the app's global query-error log skips it) and is not attempted without
 * either key (it would only be refused). An older cplm-api answers 404: a user with analytics.view then reads the loop
 * registry's tags (GET /loops, CHG-176's read); anyone else, and any failure, leaves fallback values readable, Uncertain.
 */
import React from 'react';
import { QueryClientContext, QueryObserver, type QueryObserverResult } from '@tanstack/react-query';
import { ApiError } from '../api/apiFetch';
import { getLoops } from '../api/cpmApi';
import { getLoopSignalPaths } from '../api/cpm/loopSignalPaths';
import { useAuthStore } from '../store/authStore';
import {
  bindingTrust, isFallbackBinding, loopSignalSet, signalPathSet, worstTrust, type BindingTrust, type LoopSignalLookup,
} from '../utils/bindingTrust';

const IDLE: LoopSignalLookup = { status: 'idle' };
const PENDING: LoopSignalLookup = { status: 'pending' };
const UNAVAILABLE: LoopSignalLookup = { status: 'unavailable' };
/** Read by the app's QueryCache error handler (App.tsx): no console line, no API-health report for this read. */
export const QUIET_QUERY_META = { quietOnError: true } as const;

/** The loop signal paths, or null when there are none to be had (an older cplm-api, without analytics.view). */
type SignalPaths = string[] | null;

async function readLoopSignalPaths(): Promise<SignalPaths> {
  try {
    return (await getLoopSignalPaths()).paths ?? [];
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
    // An answer, not a transient failure (no retry): fall back to the loop registry's tags, for a user who may read them.
    if (!useAuthStore.getState().hasPermission('analytics.view')) return null;
    return [...loopSignalSet((await getLoops()).loops ?? [])];
  }
}

export const loopSignalPathsQuery = {
  queryKey: ['cpm', 'loop-signal-paths'] as const, queryFn: readLoopSignalPaths, staleTime: 30_000, meta: QUIET_QUERY_META,
};

// One lookup per answer, shared by every observer of it.
const lookups = new WeakMap<string[], LoopSignalLookup>();

function lookupOf(r: QueryObserverResult<SignalPaths>): LoopSignalLookup {
  if (r.data === null) return UNAVAILABLE;
  if (r.data) {
    let l = lookups.get(r.data);
    if (!l) { l = { status: 'ready', signals: signalPathSet(r.data) }; lookups.set(r.data, l); }
    return l;
  }
  return r.status === 'error' ? UNAVAILABLE : PENDING;
}

/** The registered loop signals, read only while `enabled` (a fallback binding is present). */
export function useLoopSignalLookup(enabled: boolean): LoopSignalLookup {
  const client = React.useContext(QueryClientContext);
  const [lookup, setLookup] = React.useState<LoopSignalLookup>(PENDING);
  React.useEffect(() => {
    if (!enabled) return undefined;
    const { hasPermission } = useAuthStore.getState();
    if (!client || !(hasPermission('display.view') || hasPermission('analytics.view'))) { setLookup(UNAVAILABLE); return undefined; }
    const observer = new QueryObserver<SignalPaths>(client, loopSignalPathsQuery);
    setLookup(lookupOf(observer.getCurrentResult()));
    return observer.subscribe(r => setLookup(lookupOf(r)));
  }, [enabled, client]);
  return enabled ? lookup : IDLE;
}

export interface BatchTrust {
  /** Trust of each path, aligned with the paths asked for. */
  trust: BindingTrust[];
  /** The least trusted of them (the symbol's quality). */
  worst: BindingTrust;
  /** Changes only when a trust changes: a dependency for reads that must follow it, stable in normal operation. */
  key: string;
}

/** Trust of a batch resolve's answers (`bindings` aligned with `paths`), for the components that resolve in batches. */
export function useBatchBindingTrust(
  paths: readonly string[],
  bindings: ReadonlyArray<{ provenance?: string } | null | undefined> | undefined,
): BatchTrust {
  const lookup = useLoopSignalLookup(!!bindings?.some(isFallbackBinding));
  return React.useMemo(() => {
    const trust = paths.map((p, i) => bindingTrust(p, bindings?.[i], lookup));
    return { trust, worst: worstTrust(trust), key: trust.join(',') };
  }, [paths, bindings, lookup]);
}
