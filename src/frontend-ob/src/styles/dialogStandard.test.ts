// CHG-192 (owner review 2026-11-14, item 16): every remaining dialog in the owner's dialog standard. The wide size holds the
// Performance gate dialog's foot on one line; no CPA dialog carries a caps label (the eyebrow, the caps field label, the
// gate key's group names, the Loop summary's row labels).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const read = (p: string) => readFileSync(join(src, p), 'utf8').replace(/\r\n/g, '\n');
/** The declarations of the first rule whose selector list is exactly `selector`. */
const block = (css: string, selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : [];
});

describe('Wide dialog', () => {
  it('is wide enough for the gate dialog foot on one line (781 px measured at 1440: Prev / Next, four links, Review)', () => {
    const width = /width: (\d+)px;/.exec(block(read('ui/components.css'), '.ui-dialog--wide'))?.[1];
    expect(Number(width)).toBeGreaterThanOrEqual(781);
    expect(Number(width)).toBe(880);
  });
});

describe('No caps labels in a CPA dialog', () => {
  it('draws the gate key group names (only ever in a dialog) and the Loop summary labels in sentence case', () => {
    const key = block(read('styles/cpm-evidence-layout.css'), '.cpm-gate-legend--key .cpm-gate-legend__group-label');
    expect(key).toMatch(/text-transform: none/);
    expect(key).toMatch(/letter-spacing: normal/);
    expect(block(read('styles/cpm-loop-summary.css'), '.cpm-loop-summary__label')).not.toMatch(/uppercase|letter-spacing/);
  });

  it('uses no eyebrow or caps field label in a file that draws a dialog', () => {
    const dialogs = [...files(join(src, 'components/Cpm')), ...files(join(src, 'components/Administration'))]
      .filter(f => /<(Dialog|GateDialog|DetailsDialog)\b/.test(read(relative(src, f))));
    expect(dialogs.length).toBeGreaterThan(40);
    const offenders = dialogs.filter(f => /cpm-eyebrow|cpm-field__label|eyebrow=/.test(read(relative(src, f)))).map(f => relative(src, f));
    expect(offenders).toEqual([]);
  });
});
