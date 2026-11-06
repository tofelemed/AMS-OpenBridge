/** CHG-127: the owner's bar colours are read from one file, and Day is exactly the owner's image. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DAY: Record<string, string> = {
  performing: '#1f7a5c', oscillating: '#e07b00', valve: '#9c3d2a', effort: '#7b4fa8', saturated: '#c99a00',
  manual: '#2f6db5', 'not-assessable': '#6b7782', stale: '#a8803a', never: '#c5ccd3',
};

const css = fs.readFileSync(path.resolve(__dirname, '../styles/state-colours.css'), 'utf8');
const block = (theme: string) => new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\}`).exec(css)?.[1] ?? '';

describe('state bar colours', () => {
  it.each(Object.entries(DAY))('Day %s is the owner\'s', (name, hex) => {
    expect(new RegExp(`--state-${name}:\\s*([^;]+);`).exec(block('day'))?.[1].trim().toLowerCase()).toBe(hex);
  });

  it('Night defines every state Day defines', () => {
    const names = (body: string) => [...body.matchAll(/--state-([a-z-]+):/g)].map(m => m[1]).sort();
    expect(names(block('night'))).toEqual(names(block('day')));
  });
});
