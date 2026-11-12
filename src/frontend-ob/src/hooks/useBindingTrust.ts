/**
 * CHG-176: the Designer's binding trust in React (rules in ./bindingTrust).
 *
 * The CPA loop registry is read ONLY when a fallback binding has appeared: a display that never sees one creates no
 * query observer and sends no request. It reuses the registry query of useCpmLoops (`['cpm','loops']`, same read and
 * staleness), so the answer is cached and shared by every symbol on the display. The read is marked quiet (the app's
 * global query-error log skips it), is not attempted without analytics.view (it would only be refused), and a failure
 * leaves fallback values readable, Uncertain.
 */
import React from 'react';
import { QueryClientContext, QueryObserver, type QueryObserverResult } from '@tanstack/react-query';
import type { CpmLoop } from '../api/cpmApi';
import { useAuthStore } from '../store/authStore';
import { cpmLoopsQuery } from './useCpm';
import { bindingTrust, isFallbackBinding, loopSignalSet, worstTrust, type BindingTrust, type LoopSignalLookup } from '../utils/bindingTrust';

const IDLE: LoopSignalLookup = { status: 'idle' };
const PENDING: LoopSignalLookup = { status: 'pending' };
const UNAVAILABLE: LoopSignalLookup = { status: 'unavailable' };
/** Read by the app's QueryCache error handler (App.tsx): no console line, no API-health report for this read. */
export const QUIET_QUERY_META = { quietOnError: true } as const;

type LoopsAnswer = { loops: CpmLoop[]; count: number };
// One lookup per registry answer, shared by every observer of it.
const lookups = new WeakMap<LoopsAnswer, LoopSignalLookup>();

function lookupOf(r: QueryObserverResult<LoopsAnswer>): LoopSignalLookup {
  if (r.data) {
    let l = lookups.get(r.data);
    if (!l) { l = { status: 'ready', signals: loopSignalSet(r.data.loops ?? []) }; lookups.set(r.data, l); }
    return l;
  }
  return r.status === 'error' ? UNAVAILABLE : PENDING;
}

/** The loop registry's signals, read only while `enabled` (a fallback binding is present). */
export function useLoopSignalLookup(enabled: boolean): LoopSignalLookup {
  const client = React.useContext(QueryClientContext);
  const [lookup, setLookup] = React.useState<LoopSignalLookup>(PENDING);
  React.useEffect(() => {
    if (!enabled) return undefined;
    if (!client || !useAuthStore.getState().hasPermission('analytics.view')) { setLookup(UNAVAILABLE); return undefined; }
    const observer = new QueryObserver<LoopsAnswer>(client, { ...cpmLoopsQuery, meta: QUIET_QUERY_META });
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
