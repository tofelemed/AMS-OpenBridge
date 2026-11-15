// CHG-189 (owner review 2026-11-14, item 12): Evidence Replay's layout rules live in CSS, so this test keeps them. The foot strip
// is one compact line at desktop widths (as the Workbench's), the window's verdict line is a headline rather than a box that looks
// like a field, the evidence check rows are even, and Investigation's Review step is one column now its notes are a dialog.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
const replay = read('cpm-replay.css');
/** The declarations of the first rule whose selector list is exactly `selector`. */
const block = (css: string, selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('Evidence Replay layout (CHG-189)', () => {
  it('keeps the foot strip on one line at desktop widths, and lets it wrap below 1280 px', () => {
    expect(block(replay, '.cpm-replay-foot')).toMatch(/flex-wrap: nowrap/);
    expect(replay).toContain('@media (max-width: 1279px) {\n  .cpm-replay-foot { flex-wrap: wrap; }');
    expect(block(read('cpm-workbench.css'), '.cpm-workbench__foot-facts')).toMatch(/white-space: nowrap/);
  });

  it('draws the verdict line as a headline in key text, with no box around it', () => {
    const verdict = block(replay, '.cpm-replay-verdict');
    expect(verdict).toMatch(/font-size: var\(--traverse-type-key\)/);
    expect(verdict).not.toMatch(/border|padding/);
    expect(replay).not.toContain('.cpm-replay-reason');
  });

  it('gives every evidence check row the same height and more room', () => {
    const rows = block(replay, '.cpm-replay-check-panel__rows .cpm-kv');
    expect(rows).toMatch(/min-height: var\(--traverse-size-row\)/);
    expect(rows).toMatch(/padding: var\(--traverse-space-2\) 0/);
    expect(rows).toMatch(/align-items: center/);
  });

  it('lays Investigation’s Review step in one column', () => {
    expect(block(read('cpm-investigation.css'), '.cpm-inv-review-step')).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
  });
});
