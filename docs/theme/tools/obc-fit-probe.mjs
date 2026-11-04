#!/usr/bin/env node
// Measures what OpenBridge components can actually do, in a real browser, with no server and no lab.
// Geometry: default, then a variables-only override, then variables plus ::part. A11y: Chromium's accessibility tree.
// Focus: the real Modal and useDialogA11y from src/, bundled with esbuild into the git-ignored .tooling folder.
// Writes docs/theme/deep/data/openbridge-fit-probe.json. Usage: node docs/theme/tools/obc-fit-probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './lib/session.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const app = path.join(repo, 'src/frontend-ob');
const src = path.join(app, 'src');
const pkg = path.join(app, 'node_modules/@oicl/openbridge-webcomponents');
const css = path.join(pkg, 'dist/openbridge.css');
const bundle = path.join(pkg, 'bundle/openbridge-webcomponents.bundle.js');
const tooling = path.join(here, '.tooling');
const out = path.join(repo, 'docs/theme/deep/data/openbridge-fit-probe.json');
const esbuild = createRequire(path.join(app, 'package.json'))('esbuild');

/**
 * --assert: the gate for RD2. The adapter relies on variables and parts that OpenBridge does not
 * document, so an upgrade could drop them silently. This reads the installed package and fails if
 * the pin moved or anything the bridge depends on is gone. No browser needed.
 */
function assertAdapter() {
  const version = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
  const text = name => fs.readFileSync(path.join(pkg, 'dist/components', name), 'utf8');
  const button = text('button/button.js') + text('button/button.css.js');
  const icon = text('icon-button/icon-button.js');
  const option = text('toggle-button-option/toggle-button-option.js');
  const theme = fs.readFileSync(css, 'utf8');
  const checks = [
    ['package version is exactly 1.0.1', version === '1.0.1'],
    ['ObcButton reads --ui-components-button-visual-size', /--ui-components-button-visual-size/.test(button + theme)],
    ['ObcButton reads --ui-components-button-touch-target-size', /--ui-components-button-touch-target-size/.test(button + theme)],
    ['ObcButton reads its corner radius variables', /--ui-components-button-border-radius-top-left/.test(button + theme)],
    ['--global-typography-ui-button-font-size exists', /--global-typography-ui-button-font-size/.test(theme + button)],
    ['ObcButton exposes part wrapper', /part=["']?wrapper/.test(button)],
    ['ObcButton exposes part visible-wrapper', /part=["']?visible-wrapper/.test(button)],
    ['ObcIconButton exposes part visible-wrapper', /visible-wrapper/.test(icon)],
    ['Toggle option exposes part visible-wrapper', /visible-wrapper/.test(option)],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  console.log(`obc-probe assert: ${checks.length - failed.length} of ${checks.length}`);
  process.exit(failed.length ? 1 : 0);
}
if (process.argv.includes('--assert')) assertAdapter();

const corners = (prefix, v) => ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(c => `${prefix}-${c}: ${v};`).join('\n');
// Inherited custom properties only. No selector reaches into a shadow tree.
const VARS_ONLY = `:root {
  --ui-components-button-touch-target-size: 40px;
  /* visible-wrapper is content-box with a 1 px border, so 38 paints 40. */
  --ui-components-button-visual-size: 38px;
  --global-typography-ui-button-font-size: 14px;
  ${corners('--ui-components-button-border-radius', '6px')}
  --ui-components-icon-button-touch-target-size: 40px;
  --ui-components-icon-button-visual-target-size: 40px;
  --ui-components-icon-button-border-radius: 6px;
  --ui-components-toggle-button-touch-target-size: 40px;
  --ui-components-toggle-button-visual-size: 40px;
  --ui-components-toggle-button-toggle-button-item-touch-target-size: 40px;
  --ui-components-toggle-button-toggle-button-item-visual-size: 40px;
  --ui-components-toggle-button-border-radius: 6px;
  --ui-components-toggle-button-toggle-button-item-border-radius: 6px;
  --ui-components-input-fields-text-input-field-touch-target-size: 40px;
  --ui-components-input-fields-text-input-field-visual-size: 40px;
  --ui-components-input-fields-number-input-field-visual-size: 40px;
  ${corners('--ui-components-input-fields-text-input-field-border-radius', '6px')}
  ${corners('--ui-components-input-fields-number-input-field-border-radius', '6px')}
  --ui-components-chip-touch-target-size: 40px;
  --ui-components-chip-visual-target-size: 38px;
  --ui-components-chip-border-radius: 6px;
  --ui-components-checkbox-touch-target-size: 40px;
  --menu-navigation-components-tab-item-touch-target-size: 44px;
  --menu-navigation-components-tab-item-min-width: 80px;
  --menu-navigation-components-table-item-touch-target-size: 44px;
  --ui-components-accordion-item-touch-target-size: 40px;
}`;
const PARTS = `obc-button::part(visible-wrapper), obc-icon-button::part(visible-wrapper) { outline-offset: 3px; }
/* The guide says minimum height: a fixed height lets a wrapped label spill out of the box. */
obc-button::part(wrapper) { height: auto; min-height: 40px; }
obc-button::part(visible-wrapper) { height: auto; min-height: 38px; }
obc-toggle-button-option::part(visible-wrapper) { outline-offset: 3px; }`;

const TABS = [{ id: 'a', title: 'Summary' }, { id: 'b', title: 'Signals' }, { id: 'c', title: 'History' }];
const ROWS = [{ id: 'r1', tag: 'FIC10401', value: 12.5 }, { id: 'r2', tag: 'FIC10402', value: 3.25 }];
const COLS = [{ key: 'tag', label: 'Loop' }, { key: 'value', label: 'Value' }];
const OPTS = [{ value: 'x', label: 'By evidence score' }, { value: 'y', label: 'By control error' }];

const FIXTURE = `
<div id="f" style="display:flex;flex-direction:column;align-items:flex-start;gap:12px;width:900px">
  <obc-button id="b-normal" variant="normal">Normal label</obc-button>
  <obc-button id="b-flat" variant="flat">Flat label</obc-button>
  <obc-button id="b-raised" variant="raised">Raised label</obc-button>
  <obc-button id="b-disabled" variant="normal" disabled>Disabled</obc-button>
  <div style="width:96px"><obc-button id="b-narrow" variant="normal">Open in the Loop Explorer</obc-button></div>
  <obc-button id="b-size" variant="normal" size="small">size=small</obc-button>
  <obc-icon-button id="ib" variant="normal"><obi-close-google></obi-close-google></obc-icon-button>
  <obc-toggle-button-group id="tg" value="12h" aria-label="Window">
    <obc-toggle-button-option id="tg1" value="12h">12h</obc-toggle-button-option>
    <obc-toggle-button-option id="tg2" value="24h">24h</obc-toggle-button-option>
  </obc-toggle-button-group>
  <obc-text-input-field id="ti" placeholder="Find loop"></obc-text-input-field>
  <obc-text-input-field id="ti-label" label="Find loop" placeholder="loop id"></obc-text-input-field>
  <obc-dropdown-button id="dd" value="x"></obc-dropdown-button>
  <obc-filter-chip id="chip" label="Show stale"></obc-filter-chip>
  <obc-input-chip id="ichip" label="Stale"></obc-input-chip>
  <obc-checkbox id="cb"></obc-checkbox>
  <obc-tab-row id="tabs" hug selected-tab-id="a"></obc-tab-row>
  <obc-accordion-item id="acc" title="Basis and limitations"><div slot="expanded-content">body</div></obc-accordion-item>
  <obc-pagination id="pg" pages="5" current-page="1"></obc-pagination>
  <obc-table id="tbl" style="width:600px;height:200px"></obc-table>
  <obc-tag id="tag" label="Good"></obc-tag>
  <obc-badge id="badge" number="3"></obc-badge>
  <obc-toggletip id="tip" title="Definition" description="What the number counts"></obc-toggletip>
  <obc-tooltip id="tt"></obc-tooltip>
</div>`;

const A11Y_FIXTURE = `
<div id="ax">
  <obc-button id="ax-icon-label" aria-label="Close dialog"><obi-close-google></obi-close-google></obc-button>
  <obc-button id="ax-pressed" aria-pressed="true">Zoom area</obc-button>
  <obc-button id="ax-expanded" aria-expanded="true">More</obc-button>
  <span id="why">Needs cpm.manage</span>
  <obc-button id="ax-described" disabled aria-describedby="why">Save</obc-button>
  <obc-button id="ax-title" title="Open the loop">Open</obc-button>
  <obc-icon-button id="ax-ib-label" aria-label="Close"><obi-close-google></obi-close-google></obc-icon-button>
  <obc-icon-button id="ax-ib-slot"><obi-close-google></obi-close-google><span style="position:absolute;clip:rect(0 0 0 0)">Close</span></obc-icon-button>
  <obc-toggle-button-group id="ax-tg" value="12h" aria-label="Window">
    <obc-toggle-button-option value="12h">12h</obc-toggle-button-option><obc-toggle-button-option value="24h">24h</obc-toggle-button-option>
  </obc-toggle-button-group>
  <obc-tab-row id="ax-tabs" hug selected-tab-id="a"></obc-tab-row>
  <obc-text-input-field id="ax-ti-host" aria-label="Find loop" placeholder="loop id"></obc-text-input-field>
  <obc-text-input-field id="ax-ti-label" label="Find loop" placeholder="loop id"></obc-text-input-field>
  <obc-filter-chip id="ax-chip" label="Show stale" checked></obc-filter-chip>
  <obc-dropdown-button id="ax-dd" value="x" aria-label="Rank by"></obc-dropdown-button>
  <obc-checkbox id="ax-cb" aria-label="Grant permission"></obc-checkbox>
  <obc-pagination id="ax-pg" pages="5" current-page="1"></obc-pagination>
  <obc-accordion-item id="ax-acc" title="Basis"><div slot="expanded-content">x</div></obc-accordion-item>
  <obc-table id="ax-tbl" style="width:600px;height:200px"></obc-table>
  <label id="ax-label-ti">Role name <obc-text-input-field placeholder="e.g. ShiftSupervisor"></obc-text-input-field></label>
  <label id="ax-label-cb"><obc-checkbox></obc-checkbox><span>cpm.manage</span></label>
  <obc-input-chip id="ax-ichip" label="Stale"></obc-input-chip>
  <obc-progress-bar id="ax-progress" type="linear" mode="indeterminate"></obc-progress-bar>
  <obc-status-indicator id="ax-status" status="running"></obc-status-indicator>
  <obc-toggletip id="ax-tip" title="Definition" description="What the number counts"></obc-toggletip>
  <obc-modal-window id="ax-modal"><span slot="title">Confirm</span><div slot="content">Body</div></obc-modal-window>
</div>`;

const setProps = () => {
  const set = (sel, o) => document.querySelectorAll(sel).forEach(e => Object.assign(e, o));
  set('#tabs,#ax-tabs', { tabs: window.__TABS, selectedTabId: 'a' });
  set('#dd,#ax-dd', { options: window.__OPTS });
  set('#tbl,#ax-tbl', { columns: window.__COLS, data: window.__ROWS });
};

// Every painted element in a component's shadow tree, so nothing depends on guessing class names.
const boxes = id => {
  const host = document.getElementById(id);
  if (!host) return null;
  const hostRect = host.getBoundingClientRect();
  const acc = [];
  const walk = (root, depth) => {
    for (const el of root.children ?? []) {
      if (['STYLE', 'SLOT', 'SCRIPT'].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const painted = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
      if (r.height > 0 && depth < 6) {
        acc.push({ depth, el: `${el.tagName.toLowerCase()}${el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/).slice(0, 2).join('.') : ''}`,
          h: +r.height.toFixed(1), w: +r.width.toFixed(1), painted, radius: cs.borderTopLeftRadius, font: cs.fontSize, minW: cs.minWidth });
      }
      walk(el, depth + 1);
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
    }
  };
  if (host.shadowRoot) walk(host.shadowRoot, 0);
  return { host: { h: +hostRect.height.toFixed(1), w: +hostRect.width.toFixed(1) }, boxes: acc.slice(0, 40) };
};

const deepActive = () => {
  let a = document.activeElement;
  const path = [];
  while (a) {
    path.push(`${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.getAttribute('class') ? '.' + a.getAttribute('class').trim().split(/\s+/)[0] : ''}`);
    a = a.shadowRoot?.activeElement ?? null;
  }
  return path.join(' > ');
};

async function blank(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  await page.setContent('<!doctype html><html lang="en" data-obc-theme="day"><head><meta charset="utf-8"><title>probe</title></head><body style="margin:24px"></body></html>');
  await page.addStyleTag({ path: css });
  await page.addStyleTag({ content: 'html { font-size: 14px; }' }); // styles/app.css:13
  return page;
}

async function loadComponents(page, html) {
  await page.evaluate(h => { document.body.innerHTML = h; }, html);
  await page.addScriptTag({ path: bundle, type: 'module' });
  await page.waitForFunction(() => customElements.get('obc-button') && customElements.get('obc-table'));
  await page.evaluate(([t, r, c, o]) => { Object.assign(window, { __TABS: t, __ROWS: r, __COLS: c, __OPTS: o }); }, [TABS, ROWS, COLS, OPTS]);
  await page.evaluate(setProps);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function focusRing(page, id) {
  await page.evaluate(() => { document.activeElement?.blur?.(); });
  const start = await page.evaluateHandle(i => document.getElementById(i).previousElementSibling ?? document.body, id);
  await start.evaluate(e => e.focus?.());
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(i2 => document.activeElement?.id === i2, id);
    if (hit) break;
  }
  return page.evaluate(i => {
    const v = document.getElementById(i)?.shadowRoot?.querySelector('.visible-wrapper');
    if (!v) return null;
    const cs = getComputedStyle(v);
    return { focused: document.activeElement?.id === i, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset };
  }, id);
}

async function geometry(browser) {
  const result = {};
  for (const [name, sheet] of [['default', ''], ['varsOnly', VARS_ONLY], ['varsPlusParts', VARS_ONLY + PARTS]]) {
    const page = await blank(browser);
    if (sheet) await page.addStyleTag({ content: sheet });
    await loadComponents(page, FIXTURE);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#f [id]')].map(e => e.id));
    result[name] = {};
    for (const id of ids) result[name][id] = await page.evaluate(boxes, id);
    result[name].focusRing = await focusRing(page, 'b-normal');
    await page.close();
  }
  return result;
}

async function accessibility(browser) {
  const page = await blank(browser);
  await loadComponents(page, A11Y_FIXTURE);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const KEEP = /^(progressbar|status|button|tab|tablist|textbox|searchbox|checkbox|combobox|radio|radiogroup|group|table|row|cell|columnheader|grid|dialog|navigation|switch|link|listbox|menuitem|tooltip)$/;
  const rows = [];
  for (const n of nodes) {
    if (n.ignored || !KEEP.test(n.role?.value ?? '') || !n.backendDOMNodeId) continue;
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId }).catch(() => ({ object: null }));
    if (!object) continue;
    const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
      functionDeclaration: 'function(){let n=this;while(n){if(n.id)return n.id;n=n.parentNode||n.host;}return null}' });
    const props = Object.fromEntries((n.properties ?? []).filter(p => /pressed|checked|selected|expanded|disabled|focusable|invalid|required/.test(p.name)).map(p => [p.name, p.value.value]));
    rows.push({ owner: r.result.value, role: n.role.value, name: n.name?.value ?? '', description: n.description?.value ?? '', ...props });
  }
  const keyboard = {};
  const count = async id => page.evaluate(i => {
    const host = document.getElementById(i);
    const acc = [];
    const walk = r => r.querySelectorAll('*').forEach(e => { if (e.tabIndex >= 0 && !e.disabled) acc.push(e.tagName.toLowerCase()); if (e.shadowRoot) walk(e.shadowRoot); });
    if (host?.shadowRoot) walk(host.shadowRoot);
    if (host) walk(host); // Options of a group are light-DOM children.
    return acc.length;
  }, id);
  for (const id of ['ax-tg', 'ax-tabs', 'ax-pg', 'ax-tbl', 'ax-tip']) keyboard[`${id}:tabStops`] = await count(id);
  // Do arrow keys move between tabs (WAI-ARIA tabs pattern)?
  await page.evaluate(() => document.getElementById('ax-tabs').shadowRoot.querySelector('obc-tab-item')?.shadowRoot?.querySelector('[role="tab"]')?.focus());
  const before = await page.evaluate(deepActive);
  await page.keyboard.press('ArrowRight');
  keyboard.tabsArrowRight = { before, after: await page.evaluate(deepActive), selected: await page.evaluate(() => document.getElementById('ax-tabs').selectedTabId) };
  await page.evaluate(() => document.querySelector('#ax-tg obc-toggle-button-option')?.shadowRoot?.querySelector('button')?.focus());
  const tgBefore = await page.evaluate(deepActive);
  await page.keyboard.press('ArrowRight');
  keyboard.segmentedArrowRight = { before: tgBefore, after: await page.evaluate(deepActive) };
  keyboard.hostFocusNoDelegate = await page.evaluate(() => { const b = document.getElementById('ax-pressed'); document.activeElement?.blur?.(); b.focus(); return document.activeElement === b; });
  await page.close();
  return { nodes: rows, keyboard };
}

const ENTRY = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, FormField } from ${JSON.stringify(path.join(src, 'components/shared/Modal').replaceAll('\\', '/'))};
import { DialogProvider, useConfirm } from ${JSON.stringify(path.join(src, 'components/shared/dialogService').replaceAll('\\', '/'))};
import { useDialogA11y } from ${JSON.stringify(path.join(src, 'hooks/useDialogA11y').replaceAll('\\', '/'))};
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

const Drawer = ({ onClose }) => {
  const ref = useDialogA11y(onClose);
  return <div ref={ref} id="drawer" role="dialog" aria-modal="true" tabIndex={-1} aria-label="Drawer">
    <p>Body</p><ObcButton id="drawer-open" variant="raised" onClick={() => {}}>Open loop</ObcButton>
  </div>;
};
const App = () => {
  const [open, setOpen] = useState(null);
  const confirm = useConfirm();
  window.__open = async k => {
    if (k === 'confirm') { window.__answer = await confirm({ title: 'Delete alias', message: 'Are you sure?' }); }
    else setOpen(k);
  };
  return <>
    <button id="page-before">page control before</button>
    <button id="trigger-native" onClick={() => setOpen('form')}>Open natively</button>
    <ObcButton id="trigger-obc" variant="normal" onClick={() => setOpen('form')}>Open with ObcButton</ObcButton>
    <Modal isOpen={open === 'form'} onClose={() => setOpen(null)} title="Add alias" footer={<>
      <ObcButton id="form-cancel" variant="flat" onClick={() => setOpen(null)}>Cancel</ObcButton>
      <ObcButton id="form-save" variant="raised" onClick={() => setOpen(null)}>Save</ObcButton></>}>
      <FormField label="Alias"><input id="form-a" className="ob-input" /></FormField>
      <FormField label="Tag"><input id="form-b" className="ob-input" /></FormField>
    </Modal>
    {open === 'drawer' && <Drawer onClose={() => setOpen(null)} />}
    <button id="page-after">page control after</button>
  </>;
};
createRoot(document.getElementById('app')).render(<DialogProvider><App /></DialogProvider>);
`;

async function focusBehaviour(browser) {
  fs.mkdirSync(tooling, { recursive: true });
  const entry = path.join(tooling, 'probe-entry.jsx');
  const outfile = path.join(tooling, 'probe-bundle.js');
  fs.writeFileSync(entry, ENTRY);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', outfile, jsx: 'automatic', logLevel: 'silent',
    nodePaths: [path.join(app, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.ttf': 'empty', '.png': 'empty', '.svg': 'empty' } });
  const results = {};
  for (const scenario of ['confirm', 'form', 'drawer']) {
    const page = await blank(browser);
    await page.addStyleTag({ path: path.join(src, 'styles/hmi-dialogs.css') });
    await page.evaluate(() => { document.body.innerHTML = '<div id="app"></div>'; });
    await page.addScriptTag({ path: outfile });
    await page.waitForFunction(() => !!window.__open);
    await page.evaluate(() => document.getElementById('page-before').focus());
    await page.evaluate(k => { void window.__open(k); }, scenario);
    await page.waitForTimeout(200);
    const seq = [await page.evaluate(deepActive)];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      seq.push(await page.evaluate(deepActive));
    }
    results[scenario] = { sequence: seq, reachedObcButton: seq.some(s => /obc-button/.test(s)), leftDialog: seq.some(s => /page-(before|after)|^body$/.test(s)) };
    await page.close();
  }
  // Does focus go back to the trigger on close? (components.md: "returning focus to the trigger")
  for (const [name, id] of [['restoreNativeTrigger', 'trigger-native'], ['restoreObcButtonTrigger', 'trigger-obc']]) {
    const page = await blank(browser);
    await page.addStyleTag({ path: path.join(src, 'styles/hmi-dialogs.css') });
    await page.evaluate(() => { document.body.innerHTML = '<div id="app"></div>'; });
    await page.addScriptTag({ path: outfile });
    await page.waitForFunction(() => !!window.__open);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      if ((await page.evaluate(deepActive)).includes(id)) break;
    }
    const before = await page.evaluate(deepActive);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const opened = await page.evaluate(deepActive);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    results[name] = { before, opened, afterClose: await page.evaluate(deepActive) };
    await page.close();
  }
  return results;
}

// The ring each component really draws, read at its Tab stop. A variable or part can only change what is reachable.
async function focusRings(browser) {
  const rows = {};
  for (const [name, sheet] of [['default', ''], ['varsPlusParts', VARS_ONLY + PARTS]]) {
    const page = await blank(browser);
    if (sheet) await page.addStyleTag({ content: sheet });
    await loadComponents(page, FIXTURE);
    rows[name] = {};
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        let a = document.activeElement;
        const hostId = a?.id;
        if (!hostId) return null;
        while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
        const scope = [a, ...a.querySelectorAll('*')];
        for (let p = a.parentElement; p; p = p.parentElement) scope.push(p); // A ring may sit on any ancestor box.
        for (let p = a.getRootNode().host; p; p = p.getRootNode().host) scope.push(p);
        for (const el of scope) {
          const cs = getComputedStyle(el);
          const name2 = `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}`;
          if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) return { hostId, el: name2, width: cs.outlineWidth, offset: cs.outlineOffset, color: cs.outlineColor };
          if (cs.boxShadow !== 'none') return { hostId, el: name2, boxShadow: cs.boxShadow };
        }
        return { hostId, el: a.tagName.toLowerCase(), width: '0px', offset: 'none' };
      });
      if (r) rows[name][r.hostId] ??= r;
    }
    await page.close();
  }
  return rows;
}

// CD1 rests on this: do OpenBridge colour variables reach every button state inside the shadow tree?
async function colourBridge(browser) {
  const sheet = `obc-button {
    --raised-enabled-background-color: #006B83; --raised-enabled-border-color: #006B83;
    --raised-hover-background-color: #00576B; --raised-hover-border-color: #00576B;
    --raised-pressed-background-color: #00485A; --raised-pressed-border-color: #00485A;
    --on-raised-active-color: #FFFFFF;
    --raised-disabled-background-color: #E8EEF5; --raised-disabled-border-color: #D3DCE8; --on-raised-disabled-color: #596B81;
    --normal-enabled-background-color: transparent; --normal-enabled-border-color: #75879C;
    --normal-hover-background-color: #E5ECF4; --normal-hover-border-color: #75879C;
    --normal-pressed-background-color: #DDF3F6; --normal-pressed-border-color: #75879C; --on-normal-active-color: #152238;
    --flat-enabled-background-color: transparent; --flat-hover-background-color: #E5ECF4; --flat-pressed-background-color: #DDF3F6; --on-flat-active-color: #4B5D73;
    --border-focus-color: #006B83;
  }`;
  const page = await blank(browser);
  await page.addStyleTag({ content: sheet });
  await loadComponents(page, `<div style="display:flex;gap:16px;padding:40px">
    <obc-button id="p" variant="raised">Primary</obc-button><obc-button id="o" variant="normal">Outline</obc-button>
    <obc-button id="g" variant="flat">Ghost</obc-button><obc-button id="d" variant="raised" disabled>Disabled</obc-button></div>`);
  const read = id => page.evaluate(i => {
    const h = document.getElementById(i);
    const cs = getComputedStyle(h.shadowRoot.querySelector('.visible-wrapper'));
    return { bg: cs.backgroundColor, border: cs.borderTopColor, text: getComputedStyle(h.shadowRoot.querySelector('.label')).color };
  }, id);
  const result = {};
  for (const id of ['p', 'o', 'g', 'd']) {
    result[id] = { rest: await read(id) };
    if (id === 'd') continue;
    await page.hover(`#${id}`);
    await page.waitForTimeout(60);
    result[id].hover = await read(id);
    await page.mouse.down();
    await page.waitForTimeout(60);
    result[id].pressed = await read(id);
    await page.mouse.up();
    await page.mouse.move(0, 0);
  }
  await page.close();
  return result;
}

const browser = await chromium.launch();
try {
  const report = { generatedBy: 'docs/theme/tools/obc-fit-probe.mjs', theme: 'day', viewport: '1440x1024' };
  report.overrides = { varsOnly: VARS_ONLY, parts: PARTS };
  report.geometry = await geometry(browser);
  report.accessibility = await accessibility(browser);
  report.focus = await focusBehaviour(browser);
  report.focusRings = await focusRings(browser);
  report.colourBridge = await colourBridge(browser);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log('written', out, fs.statSync(out).size);
} finally {
  await browser.close();
}
