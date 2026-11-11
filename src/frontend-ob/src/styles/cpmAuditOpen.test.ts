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

  it('the duties matrix keeps its permission column in place when it scrolls sideways', () => {
    expect(css).toMatch(/\.cpm-gov-duties\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.cpm-gov-duties \.cpm-gov-duties__key\s*\{[^}]*position:\s*sticky[^}]*inset-inline-start:\s*0[^}]*background:/);
  });
});
