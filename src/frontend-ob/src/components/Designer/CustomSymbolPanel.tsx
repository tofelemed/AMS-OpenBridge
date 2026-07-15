// Phase 7 (T2) — the custom-symbol config pane. Lists registered custom symbols (draggable onto the
// canvas, exactly like built-ins) and provides a create/edit form: name, category, SVG template with
// {{slot}} placeholders, and the binding slots. Registration is config-only and SVG is sanitised.
import React, { useEffect, useState } from 'react';
import { Modal, FormField } from '../shared/Modal';
import {
  listCustomSymbols, registerCustomSymbol, removeCustomSymbol, subscribeCustomSymbols,
  isSafeSvg, type CustomSymbolDef, type CustomSlot,
} from './customSymbolRegistry';

const STARTER_SVG =
  '<svg viewBox="0 0 120 80" width="100%" height="100%">\n' +
  '  <rect x="2" y="2" width="116" height="76" rx="6" fill="var(--container-background-color)" stroke="var(--border-divider-color)"/>\n' +
  '  <text x="60" y="34" text-anchor="middle" font-size="12" fill="var(--element-neutral-color)">{{label}}</text>\n' +
  '  <text x="60" y="56" text-anchor="middle" font-size="18" fill="var(--element-active-color)">{{value:fixed1}}</text>\n' +
  '</svg>';

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `sym-${Date.now()}`;
}

const emptyDraft = (): CustomSymbolDef => ({
  id: '', name: '', category: 'custom', svgTemplate: STARTER_SVG,
  slots: [{ name: 'value', kind: 'value', label: 'Value' }, { name: 'label', kind: 'text', label: 'Label' }],
  defaultSize: { width: 120, height: 80 }, supportsCollections: true,
});

export const CustomSymbolPanel: React.FC = () => {
  const [defs, setDefs] = useState<CustomSymbolDef[]>(() => listCustomSymbols());
  const [editing, setEditing] = useState<CustomSymbolDef | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeCustomSymbols(() => setDefs(listCustomSymbols())), []);

  const onDragStart = (e: React.DragEvent, def: CustomSymbolDef) => {
    e.dataTransfer.setData('application/symbol-type', `custom:${def.id}`);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const save = () => {
    if (!editing) return;
    if (!editing.name.trim()) { setError('Name is required'); return; }
    if (!isSafeSvg(editing.svgTemplate)) { setError('SVG must not contain <script>/<iframe>, event handlers (on…=), or javascript:'); return; }
    const id = editing.id || slugify(editing.name);
    try {
      registerCustomSymbol({ ...editing, id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save symbol');
      return;
    }
    setEditing(null);
    setError(null);
  };

  const setSlot = (i: number, patch: Partial<CustomSlot>) => {
    if (!editing) return;
    const slots = editing.slots.map((s, j) => (j === i ? { ...s, ...patch } : s));
    setEditing({ ...editing, slots });
  };

  return (
    <div className="symbol-palette__custom" style={{ padding: '6px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--element-inactive-color)' }}>
          Custom Symbols
        </span>
        <button
          type="button" data-testid="custom-symbol-new"
          onClick={() => { setEditing(emptyDraft()); setError(null); }}
          style={{ fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-divider-color)', borderRadius: 6, background: 'var(--container-background-color)', color: 'var(--element-active-color)', padding: '2px 8px' }}
        >＋ New</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {defs.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--element-inactive-color)' }}>None yet — create one to reuse across displays.</div>
        )}
        {defs.map(def => (
          <div
            key={def.id}
            draggable
            onDragStart={(e) => onDragStart(e, def)}
            title={`Drag to place · ${def.slots.map(s => s.name).join(', ')}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid var(--border-divider-color)', borderRadius: 6, cursor: 'grab', background: 'var(--container-background-color)' }}
          >
            <span>✳️</span>
            <span style={{ fontSize: 12, color: 'var(--element-active-color)' }}>{def.name}</span>
            <button
              type="button" title="Edit" onClick={() => { setEditing(def); setError(null); }}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--element-neutral-color)' }}
            >✎</button>
            <button
              type="button" title="Delete" onClick={() => removeCustomSymbol(def.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--alert-alarm-color)' }}
            >×</button>
          </div>
        ))}
      </div>

      {editing && (
        <Modal
          isOpen
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit custom symbol' : 'New custom symbol'}
          subtitle="An SVG template with {{slot}} placeholders bound to UNS tags"
          footer={
            <>
              <button className="ob-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="ob-btn ob-btn--primary" data-testid="custom-symbol-save" onClick={save}>Save</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div style={{ color: 'var(--alert-alarm-color)', fontSize: 12 }}>{error}</div>}
            <FormField label="Name" required>
              <input className="ob-input" style={{ width: '100%' }} value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Mini Tank" />
            </FormField>
            <FormField label="Category">
              <input className="ob-input" style={{ width: '100%' }} value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </FormField>
            <FormField label="SVG template" hint="Use {{slot}} for a value, {{slot:fixed1}} for 1-decimal, {{style.fill}} for style">
              <textarea className="ob-input" style={{ width: '100%', minHeight: 140, fontFamily: 'monospace', fontSize: 12 }}
                value={editing.svgTemplate} onChange={(e) => setEditing({ ...editing, svgTemplate: e.target.value })} />
            </FormField>
            <FormField label="Binding slots">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {editing.slots.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 4 }}>
                    <input className="ob-input" style={{ flex: 1 }} placeholder="slot name" value={s.name}
                      onChange={(e) => setSlot(i, { name: e.target.value })} />
                    <select className="ob-input" value={s.kind} onChange={(e) => setSlot(i, { kind: e.target.value as CustomSlot['kind'] })}>
                      <option value="value">value</option>
                      <option value="text">text</option>
                      <option value="color">color</option>
                    </select>
                    <button className="ob-btn" onClick={() => setEditing({ ...editing, slots: editing.slots.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button className="ob-btn" onClick={() => setEditing({ ...editing, slots: [...editing.slots, { name: '', kind: 'value' }] })}>＋ Add slot</button>
              </div>
            </FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={editing.supportsCollections ?? false}
                onChange={(e) => setEditing({ ...editing, supportsCollections: e.target.checked })} />
              Can be used inside a collection cell
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CustomSymbolPanel;
