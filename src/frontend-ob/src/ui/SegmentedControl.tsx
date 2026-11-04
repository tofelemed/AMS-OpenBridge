/**
 * SPEC §6.9: native buttons with `aria-pressed`. Arrow keys move and select, passing over a disabled
 * option. The selected option is marked by weight and an edge as well as colour.
 */
import React, { useId, useRef } from 'react';
import './forms/forms.css';

export interface SegmentOption<T extends string> {
  value: T;
  /** A node when the option carries more than text, such as a count. */
  label: React.ReactNode;
  disabled?: boolean;
  /** Why the option is unavailable; shown beside the group while disabled. */
  reason?: string;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, ignoreReselect }: {
  label: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** Stay quiet when the option already selected is chosen again. */
  ignoreReselect?: boolean;
}): React.ReactElement {
  const groupRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const select = (option: SegmentOption<T>) => {
    if (option.disabled || (ignoreReselect && option.value === value)) return;
    onChange(option.value);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const wrap = (i: number) => (i + options.length) % options.length;
    let next = wrap(index + step);
    while (options[next].disabled && next !== index) next = wrap(next + step);
    select(options[next]);
    groupRef.current?.querySelectorAll('button')[next]?.focus();
  };

  const reasonId = (i: number) => `${baseId}-reason-${i}`;
  const hasReason = (o: SegmentOption<T>) => !!o.disabled && !!o.reason;

  return (
    <>
      <div ref={groupRef} role="group" aria-label={label} className="ui-segmented">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            className="ui-segmented__option"
            aria-pressed={o.value === value}
            aria-disabled={o.disabled || undefined}
            aria-describedby={hasReason(o) ? reasonId(i) : undefined}
            onClick={() => select(o)}
            onKeyDown={e => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {options.map((o, i) => hasReason(o) && <span key={o.value} id={reasonId(i)} className="ui-meta">{o.reason}</span>)}
    </>
  );
}
