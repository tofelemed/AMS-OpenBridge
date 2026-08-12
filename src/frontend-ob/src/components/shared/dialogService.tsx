'use client';

// Promise-based confirm()/prompt() backed by the shared OpenBridge Modal.
//
// Replaces window.confirm / window.prompt (native browser dialogs that ignore the
// app theme, can't be styled, and block the event loop). One <DialogProvider> is
// mounted in App; any component calls `const confirm = useConfirm()` /
// `const prompt = usePrompt()` and awaits the result:
//
//   if (!(await confirm({ title: 'Delete', message: '…', danger: true }))) return;
//   const name = await prompt({ title: 'Rename', label: 'Name', defaultValue: cur });
//   if (name == null) return;               // cancelled
//
import React, { createContext, useCallback, useContext, useState } from 'react';
import { Modal, FormField } from './Modal';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: React.ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Disallow an empty / whitespace-only submit (default: true). */
  required?: boolean;
}

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

type Active =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<Active | null>(null);
  const [value, setValue] = useState('');

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>(resolve => setActive({ kind: 'confirm', opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOptions) => new Promise<string | null>(resolve => {
      setValue(opts.defaultValue ?? '');
      setActive({ kind: 'prompt', opts, resolve });
    }),
    [],
  );

  const settle = (result: boolean | string | null) => {
    if (active) (active.resolve as (v: boolean | string | null) => void)(result);
    setActive(null);
    setValue('');
  };

  const isPrompt = active?.kind === 'prompt';
  const required = isPrompt ? (active!.opts as PromptOptions).required !== false : false;
  const canSubmit = !isPrompt || !required || value.trim().length > 0;

  const onConfirm = () => {
    if (!active) return;
    if (active.kind === 'confirm') settle(true);
    else if (canSubmit) settle(value);
  };
  const onCancel = () => settle(isPrompt ? null : false);

  const danger = active?.kind === 'confirm' && (active.opts as ConfirmOptions).danger;

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {active && (
        <Modal
          isOpen
          onClose={onCancel}
          title={active.opts.title}
          variant={danger ? 'danger' : 'default'}
          footer={
            <>
              <ObcButton variant="flat" onClick={onCancel}>
                {active.kind === 'confirm' ? ((active.opts as ConfirmOptions).cancelLabel ?? 'Cancel') : 'Cancel'}
              </ObcButton>
              <ObcButton variant="raised" onClick={onConfirm} disabled={!canSubmit}>
                {active.opts.confirmLabel ?? (active.kind === 'confirm' ? 'Confirm' : 'OK')}
              </ObcButton>
            </>
          }
        >
          {active.kind === 'confirm' ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{active.opts.message ?? 'Are you sure?'}</p>
          ) : (
            <>
              {active.opts.message && <p style={{ marginTop: 0, fontSize: 14, lineHeight: 1.5 }}>{active.opts.message}</p>}
              <FormField label={active.opts.label ?? 'Value'}>
                <input
                  className="ob-input"
                  autoFocus
                  value={value}
                  placeholder={active.opts.placeholder}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canSubmit) { e.preventDefault(); onConfirm(); } }}
                  style={{ width: '100%' }}
                />
              </FormField>
            </>
          )}
        </Modal>
      )}
    </DialogContext.Provider>
  );
};

export function useConfirm(): DialogApi['confirm'] {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useConfirm must be used within a DialogProvider');
  return ctx.confirm;
}

export function usePrompt(): DialogApi['prompt'] {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('usePrompt must be used within a DialogProvider');
  return ctx.prompt;
}
