import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Opt-in localhost instrumentation: no data calls or retained payloads. */
let enabled = false;
export function CpaAuditProbe() {
  const location = useLocation();
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (local && new URLSearchParams(location.search).get('cpaAudit') === '1') enabled = true;
  useLayoutEffect(() => {
    if (!local || !enabled) return;
    const start = performance.now();
    const route = location.pathname + location.search;
    let painted = false;
    let frame = 0;
    let count = 0;
    console.info('[CPA audit] enter', JSON.stringify({ route, clock: 'route commit to data paint' }));
    const resources = new PerformanceObserver(list => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        const url = new URL(entry.name);
        if (entry.startTime < start || !url.pathname.startsWith('/api/')) continue;
        count++;
        console.info('[CPA audit] request', JSON.stringify({ route, number: count, url: url.pathname + url.search,
          startMs: Math.round(entry.startTime - start), durationMs: Math.round(entry.duration) }));
      }
    });
    resources.observe({ type: 'resource', buffered: true });
    const check = () => {
      if (painted || !document.querySelector('[data-cpa-ready="true"]')) return;
      painted = true;
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        console.info('[CPA audit] content', JSON.stringify({ route, elapsedMs: Math.round(performance.now() - start) }));
      }); });
    };
    const changes = new MutationObserver(check);
    changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-cpa-ready'] });
    check();
    return () => { resources.disconnect(); changes.disconnect(); cancelAnimationFrame(frame); };
  }, [location.pathname, location.search, local]);
  return null;
}
