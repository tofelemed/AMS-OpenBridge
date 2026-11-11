// CHG-170 fix: the Pipeline Health rewrite deleted `.cpm-pipeline-open`, which the Governance trail and event dialog still used,
// so their row dates and Copy buttons fell back to grey browser buttons. The trail's link-buttons now have their own class in the
// stylesheet the trail imports, and this test keeps the class and its rule together.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const read = (p: string) => readFileSync(join(src, p), 'utf8');

describe('Governance link-buttons', () => {
  it('use a class the audit stylesheet defines, not the deleted pipeline one', () => {
    const css = read('styles/cpm-audit.css');
    for (const file of ['components/Cpm/governance/AuditTrail.tsx', 'components/Cpm/governance/AuditEventDialog.tsx']) {
      const tsx = read(file);
      expect(tsx).not.toContain('cpm-pipeline-open');
      expect(tsx).toContain('cpm-audit-open');
    }
    expect(css).toMatch(/\.cpm-audit-open\s*\{[^}]*background:\s*none[^}]*border:\s*0/);
    expect(css).toMatch(/\.cpm-audit-open:focus-visible\s*\{/);
  });
});
