// CHG-170 (audit, Pipeline Health): a ONE-row `.cpm-matrix` header matched both `thead tr:first-child th { top: 0 }` and
// `thead tr:last-child th { top: 26px }`; the second won, so the header sat 26 px down over the first row. The second row's
// offset now applies only when the header has two rows; Performance's two-row gate matrix keeps 0 and 26 px.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Read from disk: vitest serves a .css import as an empty string. Only the sticky-header rules are taken.
const rules = fs.readFileSync(path.resolve('src/styles/cpm.css'), 'utf8')
  .split('\n').filter(l => /^\.cpm-matrix thead tr/.test(l)).join('\n');

const mount = (headRows: number) => {
  const style = document.createElement('style');
  style.textContent = rules;
  document.head.appendChild(style);
  const rows = Array.from({ length: headRows }, (_, i) => `<tr><th>h${i}</th></tr>`).join('');
  document.body.innerHTML = `<table class="cpm-matrix"><thead>${rows}</thead><tbody><tr><td>first row</td></tr></tbody></table>`;
  return [...document.querySelectorAll('thead th')].map(th => getComputedStyle(th).top);
};

afterEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; });

describe('.cpm-matrix sticky header', () => {
  it('has the sticky-header rules to test', () => {
    expect(rules).toContain('tr:first-child th');
    expect(rules).toContain('tr:last-child');
  });

  it('keeps a one-row header at the top, so the first row is not under it', () => {
    expect(mount(1)).toEqual(['0px']);
  });

  it('keeps a two-row header stacked: the first row at 0, the second under it at 26 px', () => {
    expect(mount(2)).toEqual(['0px', '26px']);
  });
});
