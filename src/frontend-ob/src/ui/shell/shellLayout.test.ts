// CHG-194 (owner review 2026-11-14, item 18): the sidebar headings in bold, and a header aligned to the sidebar: with the
// 220 px sidebar the plant selector starts exactly at its right edge, and the plant selector and the search are narrower.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'shell.css'), 'utf8').replace(/\r\n/g, '\n');
/** The declarations of the first rule whose selector list is exactly `selector`, at the top level. */
const block = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};
const px = (rule: string, prop: string) => Number(new RegExp(`${prop}: (\\d+)px;`).exec(rule)?.[1]);

describe('Sidebar headings', () => {
  it('are bold', () => {
    expect(block('.shell-nav__group-name')).toMatch(/font-weight: (600|700);/);
  });
});

describe('Header aligned to the sidebar', () => {
  it('sizes the brand so the plant selector starts at the expanded sidebar edge (padding + brand + gap = sidebar width)', () => {
    const header = block('.shell__header');
    expect(header).toMatch(/padding: 0 var\(--traverse-space-4\);/);
    expect(header).toMatch(/gap: var\(--traverse-space-2\);/);
    const brand = block('.shell:not(.shell--rail):not(.shell--drawer) .shell__brand');
    expect(brand).toMatch(/flex: 0 0 calc\(var\(--traverse-size-sidebar-expanded\) - var\(--traverse-space-4\) - var\(--traverse-space-2\)\);/);
    expect(brand).toMatch(/margin-inline-end: 0;/);
  });

  it('draws the plant selector and the search narrower than before (380 px and 420 px)', () => {
    expect(px(block('.shell-trigger--plant'), 'max-width')).toBeLessThan(380);
    expect(px(block('.shell__search'), 'max-width')).toBeLessThan(420);
  });
});
