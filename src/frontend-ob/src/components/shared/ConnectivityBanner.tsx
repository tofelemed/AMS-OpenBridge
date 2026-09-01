'use client';

/**
 * One strip that states an app-wide API condition, so a gateway outage reads as
 * one fact instead of eight identical panel errors.
 *
 * It deliberately does NOT replace the per-panel errors. Those name WHICH read
 * failed, which is the thing this product must never hide — a global "something
 * went wrong" page would throw away the panels that did load and tell an
 * engineer nothing about what to go and fix.
 */
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiHealth, subscribeApiHealth, type ApiHealthKind } from '../../api/apiHealth';

const COPY: Record<Exclude<ApiHealthKind, 'ok'>, { title: string; body: string }> = {
  offline: {
    title: 'No network connection',
    body: 'This device is offline. Values on screen are the last ones received, not current.',
  },
  unreachable: {
    title: 'Cannot reach the API',
    body: 'Requests are not getting a response from the gateway. Values on screen are the last ones received, not current.',
  },
  degraded: {
    title: 'The API is returning errors',
    body: 'The gateway answered, but a service behind it failed. Some panels below will be empty for that reason, not because there is no data.',
  },
};

export const ConnectivityBanner: React.FC = () => {
  const health = React.useSyncExternalStore(subscribeApiHealth, getApiHealth, getApiHealth);
  const queryClient = useQueryClient();

  if (health.kind === 'ok') return null;
  const copy = COPY[health.kind];

  return (
    <div className={`ams-conn ams-conn--${health.kind}`} role="status" aria-live="polite">
      <div className="ams-conn__text">
        <strong>{copy.title}</strong>
        <span>{copy.body}</span>
        {health.lastError && <code className="ams-conn__detail">{health.lastError}</code>}
      </div>
      {/* Retries every ACTIVE query at once — the point of a single strip is a
          single recovery action, rather than hunting eight Retry buttons. */}
      <button
        type="button"
        className="ams-conn__retry"
        onClick={() => void queryClient.refetchQueries({ type: 'active' })}
      >
        Retry now
      </button>
    </div>
  );
};

export default ConnectivityBanner;
