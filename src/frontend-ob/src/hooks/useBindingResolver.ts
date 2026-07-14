import { useQuery } from '@tanstack/react-query';
import { useMqttStore, type LiveMetric } from '../store/mqttStore';
import { useEffect, useState } from 'react';
import { apiFetch } from '../api/apiFetch';

const BINDING_RESOLVER_URL = import.meta.env.VITE_BINDING_RESOLVER_URL || '/api/bindings';

// Stable empty map returned by the metrics selector when a hook has no binding (perf — see below).
const EMPTY_METRICS: ReadonlyMap<string, LiveMetric> = new Map();

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

async function resolveBinding(path: string, role: string): Promise<BindingResolution> {
  const res = await apiFetch(`${BINDING_RESOLVER_URL}/resolve?path=${encodeURIComponent(path)}&roles=${role}`);
  if (!res.ok) throw new Error('Failed to resolve binding');
  return res.json();
}

export function useBindingResolver(
  path: string | undefined,
  role: 'live' | 'history' | 'alarm' | 'all' = 'all'
) {
  const [liveValue, setLiveValue] = useState<LiveMetric | undefined>(undefined);
  // Perf: only subscribe to the live metrics map when this hook actually has a binding.
  // A display can mount thousands of unbound slot-hooks (16/symbol); subscribing them all would
  // re-render every one on every MQTT tick. Returning a stable empty map avoids that.
  const metrics = useMqttStore(state => (path ? state.metrics : EMPTY_METRICS));
  const subscribeScreen = useMqttStore(state => state.subscribeScreen);
  const unsubscribeScreen = useMqttStore(state => state.unsubscribeScreen);
  
  // First resolve the path to get transport info
  const { data: binding, isLoading: isResolving } = useQuery({
    queryKey: ['binding', path, role],
    queryFn: () => resolveBinding(path!, role),
    enabled: !!path,
    staleTime: 60_000
  });
  
  // Subscribe to MQTT for live data
  useEffect(() => {
    if (!binding?.live || role === 'history') return;
    
    const { sparkplugDevice } = binding.live;
    if (!sparkplugDevice) return;
    
    // Subscribe to the device for DDATA updates
    subscribeScreen([sparkplugDevice]);
    
    return () => {
      unsubscribeScreen([sparkplugDevice]);
    };
  }, [binding, role, subscribeScreen, unsubscribeScreen]);
  
  // Read metric value from store
  useEffect(() => {
    if (!binding?.live) return;
    
    const { sparkplugDevice, sparkplugMetric } = binding.live;
    if (!sparkplugDevice || !sparkplugMetric) return;
    
    const metricKey = `${sparkplugDevice}/${sparkplugMetric}`;
    // Set unconditionally (incl. undefined) so a rebind to a new asset clears the PREVIOUS
    // asset's value instead of showing it stale until fresh data arrives (asset swap, Phase E).
    setLiveValue(metrics.get(metricKey));
  }, [binding, metrics]);
  
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
