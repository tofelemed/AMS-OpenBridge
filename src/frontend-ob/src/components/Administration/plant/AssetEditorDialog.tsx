/**
 * Add / edit one plant node (moved out of PlantModelConfig.tsx). CHG-172 (owner review, the approved sample, badge 18): "Add
 * Area" (the parent is said once, in Place: it was "Add Area under Dallas Terminal" with the identity sentence as subtitle and
 * "Full path: …" in a hint), then Names (the identity sentence under Path segment, its rule behind ?), then the type fields for a
 * device or measurement. The parent is always the node it was opened from, never free text; the requests are as before.
 */
import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow } from '../../Cpm/shared';
import { ReasonedButton } from '../../Cpm/ReasonedButton';
import { Field, Grid, Part } from '../../Cpm/registry/wizard/editorParts';
import { apiJson, ApiError } from '../../../api/apiFetch';
import { ASSET_API, SEGMENT_RX, TYPE_NAMES, slugSegment, type AssetNode } from './plantModel';

export interface EditorState {
  mode: 'create' | 'edit';
  /** Create: the parent node (null = creating a Site). Edit: the node itself. */
  parent: AssetNode | null;
  node: AssetNode | null;
  type: number;
}

const BAD_SEGMENT = 'Invalid segment — letters, digits, _ and - only';
const help = (label: string, text: string) => <Toggletip variant="how-to" label={label}><p>{text}</p></Toggletip>;

export const AssetEditorDialog: React.FC<{ editor: EditorState; onClose: (changed: boolean) => void }> = ({ editor, onClose }) => {
  const id = useId();
  const isCreate = editor.mode === 'create';
  const node = editor.node;
  const [name, setName] = useState(node?.name ?? '');
  const [segment, setSegment] = useState('');
  const [segmentTouched, setSegmentTouched] = useState(false);
  const [description, setDescription] = useState(node?.description ?? '');
  const [template, setTemplate] = useState(node?.template ?? '');
  const [engineeringUnit, setEngineeringUnit] = useState(node?.engineeringUnit ?? '');
  const [loEng, setLoEng] = useState(node?.loEngLimit != null ? String(node.loEngLimit) : '');
  const [hiEng, setHiEng] = useState(node?.hiEngLimit != null ? String(node.hiEngLimit) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSegment = segmentTouched ? segment : slugSegment(name);
  const isMeasurement = editor.type === 5;
  const path = isCreate
    ? editor.parent ? `${editor.parent.contextualPath}${isMeasurement ? '.' : '/'}${effectiveSegment}` : effectiveSegment
    : node?.contextualPath ?? '';
  const segmentValid = effectiveSegment !== '' && SEGMENT_RX.test(effectiveSegment);
  const why = !name.trim() ? 'Display name is required' : isCreate && !segmentValid ? BAD_SEGMENT : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const numeric = (v: string) => (v.trim() === '' ? null : Number(v));
      if (isCreate) {
        await apiJson(`${ASSET_API}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contextualPath: path,
            name: name.trim() || effectiveSegment,
            type: editor.type,
            description: description.trim() || null,
            template: template.trim() || null,
            engineeringUnit: isMeasurement ? (engineeringUnit.trim() || null) : null,
            loEngLimit: isMeasurement ? numeric(loEng) : null,
            hiEngLimit: isMeasurement ? numeric(hiEng) : null,
            parentId: editor.parent?.id ?? null,
          }),
        });
      } else {
        await apiJson(`${ASSET_API}/${node!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim() || undefined,
            description,
            template,
            engineeringUnit: isMeasurement ? engineeringUnit : undefined,
            loEngLimit: isMeasurement ? numeric(loEng) : undefined,
            hiEngLimit: isMeasurement ? numeric(hiEng) : undefined,
          }),
        });
      }
      onClose(true);
    } catch (e) {
      setError(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setSaving(false);
    }
  };

  const levelName = TYPE_NAMES[editor.type];
  return createPortal(
    <Dialog open title={isCreate ? `Add ${levelName}` : `Edit ${levelName}`} onClose={() => { if (!saving) onClose(false); }}
      footer={<>
        <ObcButton variant="flat" disabled={saving} onClick={() => onClose(false)}>Cancel</ObcButton>
        <ReasonedButton variant="raised" disabled={saving || why !== null} reason={why} onClick={() => void save()}>
          {saving ? 'Saving…' : isCreate ? `Create ${levelName}` : 'Save changes'}
        </ReasonedButton>
      </>}>
      <Part title="Place">
        {isCreate && editor.parent && (
          <KvRow label="Under"><span>{editor.parent.name} · <span className="cpm-mono">{editor.parent.contextualPath}</span></span></KvRow>
        )}
        <KvRow label={isCreate ? 'Full path' : 'Path'}><span className="cpm-mono">{path || '—'}</span></KvRow>
      </Part>
      <Part title="Names">
        <div className="cpm-admin-stack">
        <Grid>
          <Field id={`${id}-name`} label="Display name *">
            <input id={`${id}-name`} className="cpm-input" value={name} placeholder={levelName === 'Site' ? 'HDPE Plant' : ''}
              onChange={e => setName(e.target.value)} />
          </Field>
          {isCreate && (
            <Field id={`${id}-seg`} label="Path segment *" help={help('Path segment', 'Letters, digits, _ and - only.')}
              note={<>
                <span className="cpm-copy">The path segment is permanent identity — the display name can change later.</span>
                {effectiveSegment && !segmentValid && <span className="cpm-field__error">{BAD_SEGMENT}</span>}
              </>}>
              <input id={`${id}-seg`} className="cpm-input cpm-mono" value={effectiveSegment}
                onChange={e => { setSegment(e.target.value); setSegmentTouched(true); }} />
            </Field>
          )}
        </Grid>
        <Field id={`${id}-desc`} label="Description">
          <input id={`${id}-desc`} className="cpm-input" value={description ?? ''} onChange={e => setDescription(e.target.value)} />
        </Field>
        </div>
      </Part>
      {(editor.type === 4 || isMeasurement) && (
        <Part title="Type">
          <Grid>
            <Field id={`${id}-tpl`} label="Template" help={help('Template', 'Type label (Pump, Tank, …) — powers collections and asset-relative displays')}>
              <input id={`${id}-tpl`} className="cpm-input" value={template ?? ''} onChange={e => setTemplate(e.target.value)} />
            </Field>
            {isMeasurement && (
              <>
                <Field id={`${id}-eu`} label="Engineering unit" help={help('Engineering unit', 'PSI, degC, %, m3/h …')}>
                  <input id={`${id}-eu`} className="cpm-input" value={engineeringUnit ?? ''} onChange={e => setEngineeringUnit(e.target.value)} />
                </Field>
                <Field id={`${id}-lo`} label="Low limit">
                  <input id={`${id}-lo`} className="cpm-input" type="number" value={loEng} onChange={e => setLoEng(e.target.value)} />
                </Field>
                <Field id={`${id}-hi`} label="High limit">
                  <input id={`${id}-hi`} className="cpm-input" type="number" value={hiEng} onChange={e => setHiEng(e.target.value)} />
                </Field>
              </>
            )}
          </Grid>
        </Part>
      )}
      {error && <p className="cpm-field__error" role="alert">{error}</p>}
    </Dialog>, document.body);
};

export default AssetEditorDialog;
