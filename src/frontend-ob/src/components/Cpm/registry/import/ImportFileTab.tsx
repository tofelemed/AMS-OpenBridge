/**
 * CHG-168 (owner review): Bulk import › File. Source, its rules behind the ? with the full column list (they were a paragraph),
 * Download template at the part's end; choose, drop or paste, then edit in place (the textarea stays the single source of truth,
 * so an uploaded file can still be corrected); the row count said once, in the drop zone. Every file and column check as before.
 */
import React, { useId, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Toggletip } from '../../../../ui/Toggletip';
import { CSV_HEADERS, REQUIRED_COLUMNS } from '../../csvImport';
import { Part } from '../wizard/editorParts';
import { plural } from './importText';

export const ImportFileTab: React.FC<{
  text: string;
  onText: (text: string) => void;
  fileName: string | null;
  fileError: string | null;
  onFile: (file: File | undefined) => void;
  rows: number;
  missing: string[];
  unknownColumns: string[];
  onTemplate: () => void;
}> = ({ text, onText, fileName, fileError, onFile, rows, missing, unknownColumns, onTemplate }) => {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <Part title="Source"
      help={(
        <Toggletip variant="how-to" label="Source">
          <p>Upload the registry export or paste it below. Required columns: {REQUIRED_COLUMNS.join(', ')}. Leave the signal columns blank to derive site/[area/]unit/&lt;tag&gt;.&lt;role&gt;; VP is only mapped when given explicitly.</p>
          <p>All columns: {CSV_HEADERS.join(', ')}.</p>
        </Toggletip>
      )}
      end={<ObcButton variant="flat" onClick={onTemplate}>Download template</ObcButton>}>
      <div className={`cpm-csv-drop${dragging ? ' cpm-csv-drop--over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}>
        <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" hidden aria-hidden="true" tabIndex={-1}
          onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <ObcButton variant="raised" onClick={() => fileInput.current?.click()}>Choose CSV file</ObcButton>
        <span className="cpm-copy">or drop a .csv here, or paste below</span>
        {rows > 0 && <span className="cpm-event-row__sub cpm-csv-drop__count">{fileName ? `${fileName} · ` : ''}{plural(rows, 'row', 'rows')}</span>}
      </div>
      {fileError && <p className="cpm-field__error">{fileError}</p>}
      <div className="cpm-field cpm-reg-field">
        <label className="ui-field__label" htmlFor={`${id}-csv`}>CSV content{fileName ? ` (loaded from ${fileName}, editable)` : ''}</label>
        <textarea id={`${id}-csv`} className="cpm-textarea cpm-mono" rows={8} value={text} spellCheck={false}
          onChange={e => onText(e.target.value)} placeholder={CSV_HEADERS.join(',')} />
      </div>
      {text && missing.length > 0 && <p className="cpm-field__error">Missing required columns: {missing.join(', ')}</p>}
      {text && unknownColumns.length > 0 && (
        <p className="cpm-field__error">Unrecognised column(s): {unknownColumns.join(', ')} — values in them are ignored.</p>
      )}
      {text.trim() !== '' && missing.length === 0 && rows === 0 && <p className="cpm-field__error">The file has a header row but no data rows.</p>}
    </Part>
  );
};

export default ImportFileTab;
