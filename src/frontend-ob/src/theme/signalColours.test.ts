import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The owner's core design (UI-050). A failure here means a trend colour moved: that needs the owner's word.
const CORE: Record<'day' | 'night', Record<string, string>> = {
  day: { pv: '#40c057', sp: '#535353', op: '#fab005', vp: '#e64980', overlay: '#7048e8', 'pen-1': '#e10019', 'pen-6': '#20c997' },
  night: { pv: '#51cf66', sp: '#9a9a9a', op: '#ffd43b', vp: '#f783ac', overlay: '#9775fa', 'pen-1': '#ff5a6a', 'pen-6': '#63e6be' },
};

const css = fs.readFileSync(path.resolve(__dirname, '../styles/signal-colours.css'), 'utf8');
const block = (theme: string) => new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\}`).exec(css)?.[1] ?? '';

describe('trend colours stay the core design', () => {
  it.each(Object.keys(CORE) as Array<'day' | 'night'>)('%s', theme => {
    const body = block(theme);
    for (const [name, hex] of Object.entries(CORE[theme])) {
      expect(new RegExp(`--signal-${name}:\\s*([^;]+);`).exec(body)?.[1].trim().toLowerCase(), name).toBe(hex);
    }
  });

  it('the chart palette reads these, in the core pen order', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../charts/chartTheme.ts'), 'utf8');
    expect(source).toContain("['pen-1', 'pv', 'op', 'vp', 'overlay', 'pen-6']");
    expect(source).not.toMatch(/pv:\s*series\(/);
  });
});
