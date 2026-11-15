// CHG-183 (owner review 2026-11-14, items 2, 7 and 17, Look 1): the button standard and the dialog band.
// OpenBridge styles obc-button through variables, so the looks live in CSS; this test keeps each rule and its
// tokens together, and keeps every "↗" button (it opens another page, owner Q4) a link.
// CHG-193 (owner decision 15 Nov 2026, final review I2 and M10): Secondary A quieter (regular weight, subtle border), the
// standard in styles/button-standard.css, and operator-display content (canvas, runtime view) on its earlier look.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const read = (p: string) => readFileSync(join(src, p), 'utf8').replace(/\r\n/g, '\n');
const bridge = read('styles/openbridge-bridge.css');
// CHG-193 (final review M10): the button standard moved out of the bridge, so both files stay under 400 lines
const standard = read('styles/button-standard.css');
const components = read('ui/components.css');
const t = (name: string) => `var\\(--traverse-${name}\\)`;
/** The declarations of the first rule whose selector list is exactly `selector`. */
const block = (css: string, selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};
// CHG-193 (final review I2): content drawn on an operator display (the Designer canvas, the runtime view) keeps its earlier look
const SCOPE = ':not(:where(.designer-canvas__stage *, .display-viewer__stage *))';
const host = (rest = '') => `obc-button${SCOPE}${rest}`;

describe('Secondary A on every normal and flat ObcButton', () => {
  const rule = block(standard, host());
  // CHG-193 (owner decision 15 Nov): quieter: the subtle border, the tint kept; hover, pressed and disabled unchanged
  it.each(['normal', 'flat'])('%s: tint, subtle border, primary text; hover, pressed and disabled per the sample', fam => {
    expect(rule).toMatch(new RegExp(`--${fam}-enabled-background-color: ${t('surface-raised')}`));
    expect(rule).toMatch(new RegExp(`--${fam}-enabled-border-color: ${t('border-subtle')}`));
    expect(rule).toMatch(new RegExp(`--on-${fam}-active-color: ${t('text-primary')}`));
    expect(rule).toMatch(new RegExp(`--${fam}-hover-border-color: ${t('action-primary')}`));
    expect(rule).toMatch(new RegExp(`--${fam}-pressed-background-color: ${t('surface-selected')}`));
    expect(rule).toMatch(new RegExp(`--${fam}-pressed-border-color: ${t('action-active')}`));
    expect(rule).toMatch(new RegExp(`--${fam}-disabled-border-color: ${t('border-subtle')}`));
    expect(rule).toMatch(new RegExp(`--on-${fam}-disabled-color: ${t('text-muted')}`));
  });

  it('labels normal and flat buttons in the regular weight; raised (Primary) keeps the OpenBridge semibold', () => {
    const weight = block(standard, `${host("[variant='normal']")},\n${host("[variant='flat']")}`);
    expect(weight).toContain('--global-typography-ui-button-font-weight: var(--font-weight-regular)');
    expect(standard.split('--global-typography-ui-button-font-weight')).toHaveLength(2);
    expect(bridge).not.toContain('--global-typography-ui-button-font-weight');
  });

  it('turns the text to the action colour on hover, and keeps a toggle that is on in the pressed look', () => {
    expect(block(standard, host(':hover'))).toMatch(new RegExp(`--on-flat-active-color: ${t('action-primary')}`));
    // the second rule with this exact selector list (the first lists it after :active, for the text colours)
    const pressed = standard.slice(standard.lastIndexOf(`\n${host("[aria-pressed='true']")} {`));
    expect(pressed.slice(0, pressed.indexOf('}'))).toMatch(new RegExp(`--flat-enabled-background-color: ${t('surface-selected')}`));
  });

  it('offers a ghost and a link opt-out on the host', () => {
    expect(standard).toMatch(/obc-button\.ui-ghost,[^{]*\{[^}]*--flat-enabled-background-color: transparent/);
    expect(standard).toMatch(new RegExp(`obc-button\\.ui-link,[^{]*\\{[^}]*--on-flat-active-color: ${t('action-primary')}`));
    expect(standard).toMatch(/obc-button\.ui-link::part\(wrapper\) \{[^}]*text-decoration: underline/);
  });

  it('lives in its own file, loaded right after the bridge, and both stay under 400 lines (M10)', () => {
    expect(read('main.tsx')).toContain("import './styles/openbridge-bridge.css';\nimport './styles/button-standard.css';");
    expect(bridge).not.toMatch(/ui-ghost|ui-link|aria-pressed/);
    expect(bridge.split('\n').length).toBeLessThanOrEqual(400);
    expect(standard.split('\n').length).toBeLessThanOrEqual(400);
  });

  // CHG-193 (final review I2): a button symbol on an operator display keeps the look it had before CHG-183
  it('leaves the Designer canvas and the runtime view on the earlier look: every Secondary A rule excludes them', () => {
    const rules = [...standard.matchAll(/\n(obc-button[^{]*)\{/g)].map(m => m[1]);
    expect(rules.length).toBeGreaterThan(5);
    for (const sel of rules.flatMap(r => r.split(/,\s*\n/)).map(x => x.trim()).filter(x => x && !/\.ui-(ghost|link)/.test(x))) {
      expect(sel.startsWith(`obc-button${SCOPE}`), sel).toBe(true);
    }
    // the earlier look stays in the bridge: a transparent normal family, and the primary text on hover
    expect(block(bridge, 'obc-button')).toContain('--normal-enabled-background-color: transparent');
    expect(block(bridge, 'obc-button:hover')).toMatch(new RegExp(`--on-flat-active-color: ${t('text-primary')}`));
  });

  it('leaves a plain .ui-link alone on an ObcButton host, where the bridge styles it', () => {
    expect(read('ui/ui.css')).toMatch(/\.ui-link:where\(:not\(obc-button\)\) \{/);
  });
});

describe('Secondary A for a plain <button> action', () => {
  it('has the same look as the ObcButton', () => {
    expect(block(components, '.ui-btn--secondary')).toMatch(new RegExp(`background: ${t('surface-raised')};\\s*border-color: ${t('border-subtle')};\\s*color: ${t('text-primary')};\\s*font-weight: var\\(--font-weight-regular\\)`));
    expect(components).toMatch(new RegExp(`\\.ui-btn--secondary:hover \\{ border-color: ${t('action-primary')}; color: ${t('action-primary')}; \\}`));
    expect(block(components, '.ui-btn')).toMatch(new RegExp(`min-height: ${t('size-control-min-height')}`));
  });
});

describe('Dialog band', () => {
  it('is solid action colour with action.on text, and the close ring shows on it', () => {
    expect(components).toMatch(new RegExp(`\\.ui-dialog__head,\\n\\.ui-inspector--drawer \\.ui-inspector__head \\{[^}]*background: ${t('action-primary')}`));
    expect(block(components, '.ui-dialog__title')).toMatch(new RegExp(`color: ${t('action-on')}`));
    expect(block(components, '.ui-dialog__subtitle')).toMatch(new RegExp(`color: ${t('action-on')}`));
    expect(components).toMatch(new RegExp(`\\.ui-dialog__head \\.ui-control:focus-visible,\\n[^{]*\\{ outline-color: ${t('action-on')}; \\}`));
  });
});

/** Every ObcButton / ReasonedButton whose label ends in ↗, with its className (null when none). */
function arrowButtons(): Array<{ where: string; label: string; className: string | null }> {
  const out: Array<{ where: string; label: string; className: string | null }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) scan(p);
    }
  };
  const scan = (file: string) => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('↗')) return;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isJsxElement(n) && /^(ObcButton|ReasonedButton)$/.test(n.openingElement.tagName.getText(sf))) {
        const label = n.children.map(c => {
          if (ts.isJsxText(c)) return c.text;
          if (ts.isJsxExpression(c) && c.expression && ts.isStringLiteralLike(c.expression)) return c.expression.text;
          if (ts.isJsxExpression(c) && c.expression && ts.isTemplateExpression(c.expression)) return c.expression.getText(sf).slice(1, -1);
          return '{}';
        }).join('').trim();
        if (label.endsWith('↗')) {
          const attr = n.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(sf) === 'className');
          const init = attr && ts.isJsxAttribute(attr) ? attr.initializer : undefined;
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          out.push({ where: `${relative(src, file)}:${line}`, label, className: init ? init.getText(sf) : null });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  };
  walk(src);
  return out;
}

describe('"↗" buttons stay links (owner Q4)', () => {
  it('every ObcButton whose label ends in ↗ carries ui-link', () => {
    const found = arrowButtons();
    expect(found.length).toBeGreaterThan(40);
    expect(found.filter(b => !/ui-link/.test(b.className ?? '')).map(b => `${b.where} ${b.label}`)).toEqual([]);
  });
});
