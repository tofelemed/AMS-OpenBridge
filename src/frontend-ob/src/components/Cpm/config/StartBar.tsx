/** The Gate Configuration start page's one filter bar: the loop search, a loop type, a plant, and the operating regions. */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

interface Option { value: string; label: string }
interface Props {
  search: React.ReactNode;
  types: Option[];
  typesLoading: boolean;
  plants: Option[];
  onType: (profile: string) => void;
  onPlant: (site: string) => void;
  onRegions: () => void;
}

/** A dropdown that only navigates: it always shows its placeholder, so the next pick works the same way. */
const Pick: React.FC<{ label: string; options: Option[]; disabled?: boolean; onPick: (v: string) => void }> = ({ label, options, disabled, onPick }) => (
  <select className="cpm-select" aria-label={label} value="" disabled={disabled} onChange={e => e.target.value && onPick(e.target.value)}>
    <option value="">{label}</option>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const StartBar: React.FC<Props> = ({ search, types, typesLoading, plants, onType, onPlant, onRegions }) => (
  <div className="cpm-surface cpm-config-choosebar" role="group" aria-label="Choose what to change">
    {search}
    <Pick label="Loop type" options={types} disabled={typesLoading} onPick={onType} />
    <Pick label="Whole plant" options={plants} onPick={onPlant} />
    <ObcButton variant="normal" onClick={onRegions}>Operating regions</ObcButton>
  </div>
);
