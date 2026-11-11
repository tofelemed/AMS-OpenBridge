// @vitest-environment jsdom
// Each page keeps its rule: nobody gains or loses a page, role by role.
import { describe, expect, it } from 'vitest';
import { visibleDestinations, type DestinationId } from '../../cpa/destinations';

const menu = (held: string[]): DestinationId[] => visibleDestinations(p => held.includes(p)).map(d => d.id);

const READING: DestinationId[] = [
  'overview', 'performance', 'events', 'explorer', 'historical', 'investigation', 'workbench', 'replay', 'windows',
  'calculations', 'response', 'registry',
];

describe('who sees which page', () => {
  it('a full administrator sees all 17', () => {
    expect(menu(['analytics.view', 'historian.view', 'cpm.config.read', 'system.manage', 'admin.users.edit'])).toHaveLength(17);
  });

  it('an operator reads the loops and gets no System page', () => {
    expect(menu(['analytics.view'])).toEqual(READING);
  });

  // CHG-172 (owner answer 3f): Plant model and Tag aliases open with asset.view, so Administration shows; Governance does not.
  it('an asset viewer keeps Administration, where Plant model and Tag aliases are, and gains no Governance', () => {
    expect(menu(['analytics.view', 'asset.view'])).toEqual([...READING, 'administration']);
  });

  it('an auditor keeps the trail, on Governance, and gains nothing', () => {
    expect(menu(['analytics.view', 'admin.audit.view'])).toEqual([...READING, 'administration', 'governance']);
  });

  // CHG-174 (owner answer 2): Governance opens with system.manage or admin.audit.view only, as the sidebar always showed it; a
  // role manager or an ingestion viewer without either landed on "Audit reads require the admin.audit.view permission" alone.
  it('a role manager keeps Administration, and is offered no Set up page and no Governance', () => {
    expect(menu(['rbac.manage'])).toEqual(['administration']);
  });

  it('an ingestion viewer keeps Administration, where Data sources is, and no Governance', () => {
    expect(menu(['ingestion.view'])).toEqual(['administration']);
  });

  it('system.manage alone keeps Pipeline Health and Governance, and no Administration', () => {
    expect(menu(['system.manage'])).toEqual(['pipeline', 'governance']);
  });

  it('gate configuration stays with its own permission', () => {
    expect(menu(['cpm.config.read'])).toEqual(['config']);
  });
});
