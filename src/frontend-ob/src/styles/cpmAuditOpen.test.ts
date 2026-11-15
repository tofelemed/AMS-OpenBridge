// CHG-170 fix: the Pipeline Health rewrite deleted `.cpm-pipeline-open`, which the Governance trail and event dialog still used,
// so their row dates and Copy buttons fell back to grey browser buttons. The trail's link-buttons now have their own class in the
// stylesheet the page imports, and this test keeps the class and its rule together.
// CHG-174: the event dialog went (the selected event is in a panel; Copy is the ⧉ icon button), so only the trail's row dates
// use the class; the page imports the stylesheet; the duties matrix keeps its permission column in place when scrolled.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const read = (p: string) => readFileSync(join(src, p), 'utf8');
const css = read('styles/cpm-audit.css');

describe('Governance link-buttons', () => {
  it('use a class the audit stylesheet defines, not the deleted pipeline one', () => {
    const tsx = read('components/Cpm/governance/AuditTrail.tsx');
    expect(tsx).not.toContain('cpm-pipeline-open');
    expect(tsx).toContain('cpm-audit-open');
    expect(css).toMatch(/\.cpm-audit-open\s*\{[^}]*background:\s*none[^}]*border:\s*0/);
    expect(css).toMatch(/\.cpm-audit-open:focus-visible\s*\{/);
  });

  it('the page imports the stylesheet that defines them', () => {
    expect(read('components/Cpm/CpmGovernance.tsx')).toContain("import '../../styles/cpm-audit.css';");
  });

  // CHG-203 browser check: How to read sat centred on Verify audit chain plus its last-run line, 12 px below the Verify button's top
  it('lines the header buttons up by their tops', () => {
    expect(css).toMatch(/\.cpm-gov \.cpm-workspace-header__actions\s*\{[^}]*align-items:\s*flex-start/);
  });

  // CHG-203 browser check: below 900 px the shared rule (cpm-responsive.css) makes every .cpm-table a block that scrolls, so the
  // trail shrank to its content (608 of 688 px at 768). It is fixed-layout and wraps, so it stays a full-width table above 600 px
  it('keeps the audit tables full width between the phone layout and 900 px', () => {
    const range = css.slice(css.indexOf('@media (min-width: 600.02px) and (max-width: 900px)'));
    expect(range).toMatch(/^@media \(min-width: 600\.02px\) and \(max-width: 900px\) \{\s*\.cpm-screen\.cpm-gov table\.cpm-gov-table \{ display: table; \}/);
  });

  // CHG-203 browser check: at 9rem (126 px) the time range cut "Last 24 hours" to "Last 24 hour"; 10rem holds its words, taken
  // from Find's starting width so the five filters still fit one line at 768 px (686 px of row)
  it('keeps the time range wide enough for its words, the row one line at 768 px', () => {
    expect(css).toMatch(/\n\.cpm-gov-filters__range \{ flex: 0 0 10rem; \}/);
    expect(css).toMatch(/\n\.cpm-gov-filters \.cpm-gov-filters__find \{ flex: 1 1 9rem; \}/);
  });

  // CHG-203: Build details went with CHG-202, and the foot that held it with them
  it('keeps no rule for the removed Build details foot', () => {
    expect(css).not.toContain('cpm-gov-trace__foot');
  });

  it('the duties matrix keeps its permission column in place when it scrolls sideways', () => {
    expect(css).toMatch(/\.cpm-gov-duties\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.cpm-gov-duties \.cpm-gov-duties__key\s*\{[^}]*position:\s*sticky[^}]*inset-inline-start:\s*0[^}]*background:/);
  });
});
