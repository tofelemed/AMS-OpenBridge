/**
 * SPEC §6.9: `role="tablist"` with `aria-selected`, a roving tab stop and arrow keys. The caller
 * renders the panel and links it with `tabPanelProps`.
 */
import React, { useRef } from 'react';
import './forms/forms.css';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  /** A count beside the label. Zero is shown: it answers the question without a click. */
  badge?: number;
}

const tabId = (base: string, value: string) => `${base}-tab-${value}`;
const panelId = (base: string, value: string) => `${base}-panel-${value}`;

export const tabPanelProps = (base: string, value: string) => ({
  role: 'tabpanel' as const,
  id: panelId(base, value),
  'aria-labelledby': tabId(base, value),
});

export function Tabs<T extends string>({ idBase, label, options, value, onChange }: {
  idBase: string;
  label: string;
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (next: T) => void;
}): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);

  const moveTo = (index: number) => {
    onChange(options[index].value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = options.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (targets[e.key] === undefined) return;
    e.preventDefault();
    moveTo(targets[e.key]);
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} className="ui-tabs">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          id={tabId(idBase, o.value)}
          aria-selected={o.value === value}
          aria-controls={panelId(idBase, o.value)}
          tabIndex={o.value === value ? 0 : -1}
          className="ui-tabs__tab"
          onClick={() => onChange(o.value)}
          onKeyDown={e => onKeyDown(e, i)}
        >
          {o.label}
          {o.badge != null && <span className="ui-tabs__badge">{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}
