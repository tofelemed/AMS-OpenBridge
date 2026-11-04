/**
 * SPEC §6.9: native buttons with `aria-pressed`. Arrow keys move and select. The selected option
 * is marked by weight and an edge as well as colour.
 */
import React, { useRef } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
}): React.ReactElement {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    groupRef.current?.querySelectorAll('button')[next]?.focus();
  };

  return (
    <div ref={groupRef} role="group" aria-label={label} className="ui-segmented">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          className="ui-segmented__option"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          onKeyDown={e => onKeyDown(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
