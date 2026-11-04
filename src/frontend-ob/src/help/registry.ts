/**
 * The metric help registry (SPEC 6.7, CD16), keyed by `M-###`. `registry.json` is generated from
 * `docs/theme/deep/help-registry-draft.md` by `scripts/redesign/build-help-registry.mjs`: change the
 * draft and re-run the script, never edit the JSON. Text is verbatim until Q7 is issued (RD10).
 */
import registry from './registry.json';

/** `as-implemented` is the draft's "(as implemented, pending approval (Q7))" on every field. */
export type HelpStatus = 'as-implemented' | 'approved';

export interface HelpEntry {
  id: string;
  name: string;
  /** The draft's `##` section. */
  group: string;
  what: string;
  formula: string;
  window: string;
  unit: string;
  source: string;
  /** Where the value's proof can be reached today. */
  link: string;
  status: HelpStatus;
  /** The draft's "Register status" line, which carries any known conflict. */
  registerStatus: string;
  /** Source references taken out of the text. Implementation detail: never shown to operators. */
  citations: string[];
}

const entries = registry as unknown as Readonly<Record<string, HelpEntry>>;

/** The entry for an `M-###` id. A missing id gives undefined, never a throw. */
export function helpFor(id: string | null | undefined): HelpEntry | undefined {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(entries, id)) return undefined;
  return entries[id];
}
