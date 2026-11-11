/**
 * CHG-165 (owner review): System Response in the engineer's order, one question per tab. Events: which steps did the loop see,
 * and which qualified. Response: what model came out of this step. Fit quality: can it be trusted. Frequency: how much margin
 * does the loop have. Steps & data: how did the kernel decide. Models: how has the loop's model changed, and is it reviewed.
 * The tab lives in `?tab=`; a link that names an event (or a G12 run) opens Response. Each tab but the last ends with Next.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Tabs, tabPanelProps } from '../../../ui/Tabs';

export const RESPONSE_TABS = [
  { value: 'events', label: 'Events' },
  { value: 'response', label: 'Response' },
  { value: 'fit', label: 'Fit quality' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'steps', label: 'Steps & data' },
  { value: 'models', label: 'Models' },
] as const;
export type ResponseTab = (typeof RESPONSE_TABS)[number]['value'];

const VALUES = RESPONSE_TABS.map(t => t.value) as readonly string[];
const OPTIONS = RESPONSE_TABS.map(t => ({ value: t.value as ResponseTab, label: t.label }));

/** The tab in the address; without one, a chosen event (or a G12 run being resolved) opens Response. */
export function tabOf(params: URLSearchParams): ResponseTab {
  const tab = params.get('tab');
  if (tab && VALUES.includes(tab)) return tab as ResponseTab;
  return params.get('event') || params.get('methodRun') ? 'response' : 'events';
}

/** The tabs that read one event; Events and Models are about the loop. */
export const needsEvent = (tab: ResponseTab): boolean => tab !== 'events' && tab !== 'models';

export const ResponseTabs: React.FC<{
  tab: ResponseTab;
  onTab: (tab: ResponseTab) => void;
  /** The selected event, said once. */
  foot?: string;
  children: React.ReactNode;
}> = ({ tab, onTab, foot, children }) => {
  const next = RESPONSE_TABS[VALUES.indexOf(tab) + 1];
  return (
    <section className="cpm-surface cpm-inv-steps cpm-response-tabs">
      <div className="cpm-tabs-row">
        <div className="cpm-tabs">
          <Tabs idBase="response" label="System Response" options={OPTIONS} value={tab} onChange={onTab} />
        </div>
      </div>
      <div className="cpm-tabpanel" {...tabPanelProps('response', tab)}>{children}</div>
      {(foot || next) && (
        <div className="cpm-inv-steps__foot cpm-response-tabs__foot">
          {foot && <span className="cpm-copy">{foot}</span>}
          {next && <ObcButton variant="normal" onClick={() => onTab(next.value)}>Next: {next.label} →</ObcButton>}
        </div>
      )}
    </section>
  );
};

export default ResponseTabs;
