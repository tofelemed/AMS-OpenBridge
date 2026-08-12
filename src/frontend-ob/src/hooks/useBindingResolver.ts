import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMqttStore } from '../store/mqttStore';
import React, { useEffect } from 'react';
import { apiFetch } from '../api/apiFetch';

const BINDING_RESOLVER_URL = import.meta.env.VITE_BINDING_RESOLVER_URL || '/api/bindings';


interface BindingResolution {
  contextualPath: string;
  resolved: boolean;
  live?: {
    sparkplugTopic: string;
    sparkplugGroup: string;
    sparkplugEdgeNode: string;
    sparkplugDevice: string;
    sparkplugMetric?: string;
    redisSnapshotKey?: string;
    snapshotEndpoint: string;
  };
  history?: {
    iotDbPath: string;
    trendEndpoint: string;
    rawEndpoint: string;
  };
  alarm?: {
    alarmSource: string;
    signalRHub: string;
    kafkaTopic: string;
  };
}

async function resolveBinding(path: string, role: string, signal?: AbortSignal): Promise<BindingResolution> {
  const res = await apiFetch(`${BINDING_RESOLVER_URL}/resolve?path=${encodeURIComponent(path)}&roles=${role}`, { signal });
  if (!res.ok) throw new Error('Failed to resolve binding');
  return res.json();
}

/** H10: while a page-level batch resolve is priming the cache, per-slot hooks
 *  hold off — otherwise a 50-symbol display fires 50 individual GET /resolve
 *  calls in the same tick the ONE batch POST is answering. Default: no batch
 *  in progress, hooks behave exactly as before. */
export const BindingPrimeContext = React.createContext<{ priming: boolean }>({ priming: false });

/**
 * H10: resolve a display's bindings in ONE POST /resolve/batch and prime the
 * per-path query cache (['binding', path, role]) that useBindingResolver reads.
 * Returns true while priming. On any failure it simply stops priming and the
 * per-slot hooks fall back to individual resolves — no functional regression.
 */
export function usePrimeBindings(paths: string[], role: 'live' | 'history' | 'alarm' | 'all' = 'live'): boolean {
  const qc = useQueryClient();
  const pathsKey = React.useMemo(() => [...new Set(paths)].sort().join('|'), [paths]);
  const [priming, setPriming] = React.useState(() => paths.length > 0);

  useEffect(() => {
    const unique = pathsKey ? pathsKey.split('|') : [];
    // Only fetch paths the cache doesn't already have fresh.
    const missing = unique.filter(p => qc.getQueryData(['binding', p, role]) === undefined);
    if (missing.length === 0) { setPriming(false); return; }
    setPriming(true);
    let cancelled = false;
    (async () => {
      try {
        // Server caps a batch at 100 bindings.
        for (let i = 0; i < missing.length; i += 100) {
          const slice = missing.slice(i, i + 100);
          const res = await apiFetch(`${BINDING_RESOLVER_URL}/resolve/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bindings: slice.map(path => ({ path, roles: [role] })) }),
          });
          if (!res.ok) throw new Error(`batch resolve → ${res.status}`);
          const data = await res.json() as { bindings?: BindingResolution[] };
          for (const b of data.bindings ?? []) {
            qc.setQueryData(['binding', b.contextualPath, role], b);
          }
        }
      } catch (err) {
        console.warn('[useBindingResolver] batch prime failed — falling back to per-slot resolves', err);
      }
      if (!cancelled) setPriming(false);
    })();
    return () => { cancelled = true; };
  }, [pathsKey, role, qc]);

  return priming;
}

export function useBindingResolver(
  path: string | undefined,
  role: 'live' | 'history' | 'alarm' | 'all' = 'all'
) {
  const subscribeScreen = useMqttStore(state => state.subscribeScreen);
  const unsubscribeScreen = useMqttStore(state => state.unsubscribeScreen);
  const { priming } = React.useContext(BindingPrimeContext);

  // First resolve the path to get transport info.
  // FE-03: React Query's abort signal is threaded through, so navigating away or
  // rebinding cancels the in-flight resolve instead of letting a stale response land.
  // H10: paused while a page-level batch is priming this exact cache key.
  const { data: binding, isLoading: isResolving } = useQuery({
    queryKey: ['binding', path, role],
    queryFn: ({ signal }) => resolveBinding(path!, role, signal),
    enabled: !!path && !priming,
    staleTime: 60_000
  });

  // FE-04: subscribe to THIS slot's metric key only — not the whole metrics Map.
  // A dense display mounts hundreds of bound slot-hooks; with the Map-level
  // subscription every one re-rendered on EVERY device's update. The per-key
  // selector re-renders a slot only when its own metric object changes (unchanged
  // keys keep object identity across the coalesced store flush). A rebind to a new
  // asset naturally yields undefined until fresh data arrives (asset-swap safe).
  const live = binding?.live;
  const metricKey = live?.sparkplugDevice && live.sparkplugMetric
    ? `${live.sparkplugDevice}/${live.sparkplugMetric}`
    : undefined;
  const liveValue = useMqttStore(state => (metricKey ? state.metrics.get(metricKey) : undefined));

  // Subscribe to MQTT for live data
  useEffect(() => {
    if (!binding?.live || role === 'history') return;

    const { sparkplugTopic, sparkplugGroup, sparkplugEdgeNode, sparkplugDevice } = binding.live;
    if (!sparkplugDevice) return;

    // Subscribe to the exact DDATA topic — it carries the real group/edge (multi-site safe) and
    // scopes traffic to this open screen (W10). Fall back to composing it if the resolver omitted it.
    const topic = sparkplugTopic
      || `spBv1.0/${sparkplugGroup}/DDATA/${sparkplugEdgeNode}/${sparkplugDevice}`;
    subscribeScreen([topic]);

    return () => {
      unsubscribeScreen([topic]);
    };
  }, [binding, role, subscribeScreen, unsubscribeScreen]);

  return {
    data: liveValue?.value,
    metric: liveValue,
    binding,
    isLoading: isResolving,
    isResolved: binding?.resolved ?? false
  };
}

export function useBatchBindingResolver(
  paths: string[],
  role: 'live' | 'history' | 'alarm' | 'all' = 'all'
) {
  return useQuery({
    queryKey: ['bindings-batch', paths, role],
    queryFn: async () => {
      const res = await apiFetch(`${BINDING_RESOLVER_URL}/resolve/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bindings: paths.map(path => ({ path, roles: [role] }))
        })
      });
      if (!res.ok) throw new Error('Failed to resolve bindings');
      return res.json();
    },
    enabled: paths.length > 0,
    staleTime: 60_000
  });
}

export default useBindingResolver;
