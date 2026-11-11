// CHG-174 (owner answer 2): Governance opens with system.manage OR admin.audit.view, alike in the sidebar (navItems.ts), the route
// (AppRoutes.tsx) and the command palette (destinations.ts). The sidebar showed it to system.manage only, while the route and the
// palette opened it for any administration key, so an ingestion viewer landed on "Audit reads require …" and nothing else.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-list-alt-check-google', () => ({ ObiListAltCheckGoogle: () => null }));

const { DESTINATIONS, GOVERNANCE_PERMISSIONS, visibleDestinations } = await import('./destinations');
const { navItems } = await import('../components/nav/navItems');

describe('who opens Governance', () => {
  it('system.manage or admin.audit.view, nothing else', () => {
    expect([...GOVERNANCE_PERMISSIONS]).toEqual(['system.manage', 'admin.audit.view']);
  });

  it('the palette and the CPA menu use that rule', () => {
    expect(DESTINATIONS.find(d => d.id === 'governance')?.showTo).toEqual(GOVERNANCE_PERMISSIONS);
    expect(visibleDestinations(p => p === 'ingestion.view').map(d => d.id)).not.toContain('governance');
    expect(visibleDestinations(p => p === 'admin.audit.view').map(d => d.id)).toContain('governance');
  });

  it('the sidebar entry uses that rule', () => {
    const item = navItems.find(i => i.path === '/cpm/governance');
    expect(item?.anyOf).toEqual([...GOVERNANCE_PERMISSIONS]);
  });

  it('the route uses that rule', () => {
    const routes = readFileSync(join(__dirname, '..', 'app', 'AppRoutes.tsx'), 'utf8');
    const line = routes.split('\n').find(l => l.includes('path="/cpm/governance"')) ?? '';
    expect(line).toContain('anyOf={[...GOVERNANCE_PERMISSIONS]}');
  });
});
