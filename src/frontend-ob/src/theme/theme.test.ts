// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, applyTheme, normaliseTheme, readTheme } from './theme';

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const headScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

/** Runs the blocking script from index.html exactly as the browser would. */
const runHeadScript = () => new Function(headScript)();

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute('data-theme');
  root.removeAttribute('data-obc-theme');
});

describe('index.html', () => {
  it('runs the theme script before any stylesheet or module script', () => {
    const script = html.indexOf('<script>');
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(html.indexOf('<script type="module"'));
    expect(html.indexOf('<link rel="stylesheet"') === -1 || script < html.indexOf('<link rel="stylesheet"')).toBe(true);
  });

  it('hardcodes no theme attribute on <html>', () => {
    expect(/<html[^>]*data-(obc-)?theme/.test(html)).toBe(false);
  });
});

describe('storage migration', () => {
  it.each([
    ['day', 'day'],
    ['night', 'night'],
    ['bright', 'day'],
    ['light', 'day'],
    ['dark', 'night'],
    ['garbage', 'day'],
    ['', 'day'],
  ])('head script: stored %j paints %s and is rewritten', (stored, expected) => {
    localStorage.setItem(THEME_STORAGE_KEY, stored);
    runHeadScript();
    expect(root.getAttribute('data-theme')).toBe(expected);
    expect(root.getAttribute('data-obc-theme')).toBe(expected);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(expected);
  });

  it('head script: a fresh profile paints day', () => {
    runHeadScript();
    expect(root.getAttribute('data-theme')).toBe('day');
  });

  it.each(['day', 'night', 'bright', 'light', 'dark', 'garbage', '', null, undefined])('module agrees with the head script for %j', stored => {
    if (typeof stored === 'string') localStorage.setItem(THEME_STORAGE_KEY, stored);
    runHeadScript();
    expect(normaliseTheme(stored)).toBe(root.getAttribute('data-theme'));
  });
});

describe('applyTheme', () => {
  it('sets both attributes and stores the choice', () => {
    applyTheme('night');
    expect(root.getAttribute('data-theme')).toBe('night');
    expect(root.getAttribute('data-obc-theme')).toBe('night');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
  });

  it('readTheme returns what was applied', () => {
    applyTheme('night');
    expect(readTheme()).toBe('night');
  });
});
