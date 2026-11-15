// CHG-187 (owner review 2026-11-14, item 9): three layout rules of the Evidence Workbench live in CSS, so this test keeps them.
// Every gate in the rail reads on one line (G14 "Final-element confirmation" wrapped), the window dropdown shows its whole label
// (250 px cut "Oscillation confirmed", here and on Investigation, which share the select), and the foot strip is one line.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'cpm-workbench.css'), 'utf8').replace(/\r\n/g, '\n');
/** The declarations of the first rule whose selector list is exactly `selector`. */
const block = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('Evidence Workbench layout', () => {
  it('sizes the rail to its longest gate and never wraps a gate name', () => {
    expect(block('.cpm-workbench')).toMatch(/grid-template-columns: minmax\(180px, max-content\) minmax\(0, 1fr\)/);
    const name = block('.cpm-rail__name');
    expect(name).toMatch(/white-space: nowrap/);
    expect(name).not.toMatch(/overflow-wrap: anywhere/);
  });

  it('sizes the shared window dropdown to its whole label on compact pages, and keeps the band on one line', () => {
    const select = block('.cpm-compact .cpm-band .cpm-evidence-toolbar__window');
    expect(select).toMatch(/width: auto/);
    expect(select).not.toMatch(/max-width: 250px/);
    expect(block('.cpm-compact .cpm-band__row')).toMatch(/column-gap: var\(--traverse-space-2\)/);
  });

  it('keeps the foot strip facts on one line at desktop widths', () => {
    expect(block('.cpm-workbench__foot')).toMatch(/flex-wrap: nowrap/);
    expect(block('.cpm-workbench__foot-facts')).toMatch(/white-space: nowrap/);
    expect(css).toContain('@media (max-width: 1279px) {\n  .cpm-workbench__foot { flex-wrap: wrap; }');
  });
});
