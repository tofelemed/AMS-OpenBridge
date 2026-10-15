/**
 * CHG-098 (SME review 2 #27): visible completion for an operator action (acknowledge, shelve, unshelve, note link,
 * republish). A short line beside the action that says what was recorded, by whom and when — or why it failed — and
 * stays until the next action replaces it. Not a toast: CLAUDE.md keeps notification surfaces on OpenBridge alert
 * components, and a confirmation is not an alert. The success line is a polite live region that is always mounted
 * (so a screen reader announces it); a failure is role="alert" in the existing field-error style.
 */
import React from 'react';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';
import { useAuthStore } from '../../store/authStore';
import { fmtDateTime } from './shared';

export interface Receipt {
  ok: boolean;
  text: string;
  /** The record the receipt belongs to (an episode id), so a parent can show it only beside that record. */
  key?: string | number;
}

/** The failure's own reason (the API's problem detail when it sent one), never a bare "failed". */
export function reasonOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'no reason was returned';
}

export const receiptDone = (text: string, key?: string | number): Receipt => ({ ok: true, text, key });
export const receiptFailed = (what: string, err: unknown, key?: string | number): Receipt =>
  ({ ok: false, text: `${what} failed — ${reasonOf(err)}`, key });

/** "by eng.a at 15/10/2026, 10:32:05 CEST" — the signed-in user and the moment the server answered. */
export function byNow(user: string | null | undefined, at: number = Date.now()): string {
  return `${user ? `by ${user} ` : ''}at ${fmtDateTime(at)}`;
}

/** The signed-in user's short name for a receipt. */
export const useReceiptUser = (): string | null =>
  useAuthStore(s => s.user?.username ?? null);

export const ActionReceipt: React.FC<{ receipt: Receipt | null | undefined }> = ({ receipt }) => (
  <>
    <div className="cpm-action-receipt" role="status" aria-live="polite">
      {receipt?.ok && (
        <>
          <span className="cpm-action-receipt__icon" aria-hidden><ObiCheckGoogle /></span>
          <span>{receipt.text}</span>
        </>
      )}
    </div>
    {receipt && !receipt.ok && <p className="cpm-field__error" role="alert">{receipt.text}</p>}
  </>
);

export default ActionReceipt;
