// CHG-195 (owner review item 19): a chart's hover readout stays inside the chart, so it never hides under the sidebar. The one
// tooltip chrome every Traverse chart spreads carries `confine`; every CPA chart takes its tooltip from that chrome (or hides it).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseOption, plainOption, tooltipChrome, type ChartPalette } from './chartTheme';

const palette = { tooltipBg: 'a', tooltipBorder: 'b', tooltipFg: 'c', tick: 'd', axis: 'e' } as unknown as ChartPalette;

describe('Tooltip chrome', () => {
  it('confines the readout to the chart', () => {
    expect(tooltipChrome(palette).confine).toBe(true);
    expect(plainOption(palette).tooltip.confine).toBe(true);
    expect(baseOption(palette).tooltip.confine).toBe(true);
  });
});

const src = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
});

describe('Every CPA chart', () => {
  it('takes its tooltip from the shared chrome, or hides it', () => {
    const roots = ['components/Cpm', 'components/charts', 'ui/trend'].map(r => join(src, r));
    const loose: string[] = [];
    let checked = 0;
    for (const file of roots.flatMap(files)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/tooltip: \{([^}]{0,160})/g)) {
        checked++;
        if (!/\.\.\.base\.tooltip|\.\.\.tooltipChrome\(|show: false/.test(m[1])) loose.push(`${relative(src, file)}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(loose).toEqual([]);
  });
});
