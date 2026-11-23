// CHG-220 (owner, 23 Nov 2026; gap 5): Approve is offered only where cplm-api accepts it - a second person, or the author as
// Admin / SuperAdmin; a SITE bundle needs a SuperAdmin (CHG-224: no property does).
import { describe, expect, it } from 'vitest';
import { SUPERADMIN_PROPERTIES, bundleApproveRule, needsSuperAdmin } from './approvalRules';
import type { Bundle, ConfigLayer } from '../../../api/cpm/config';

const layer = (kind: ConfigLayer['kind'], content: Record<string, unknown>): ConfigLayer => ({ kind, ref: null, ordinal: 0, content, content_hash: 'h' });
const bundle = (over: Partial<Bundle> = {}) => ({
  createdBy: 'alice', scopeKind: 'LOOP' as Bundle['scopeKind'],
  layers: [layer('FACTORY', { 'G3.objective_type': 'REGULATORY' }), layer('LOOP', { 'G4.min_samples': 30 })],
  resolved: { properties: { 'G3.objective_type': 'REGULATORY', 'G4.min_samples': 30 }, sources: {}, execution_plan: {} },
  ...over,
});
const alice = (role: string) => ({ username: 'Alice', role });
const bob = (role: string) => ({ username: 'bob', role });

describe('bundleApproveRule', () => {
  it('a second person approves; the author needs a second person unless Admin or SuperAdmin', () => {
    expect(bundleApproveRule(bundle(), bob('Engineer'))).toEqual({ label: 'Approve', reason: null });
    expect(bundleApproveRule(bundle(), alice('Engineer'))).toEqual({ label: 'Approve', reason: 'Needs a second person' });
    expect(bundleApproveRule(bundle(), alice('Admin'))).toEqual({ label: 'Approve alone (Admin)', reason: null });
    expect(bundleApproveRule(bundle(), alice('SuperAdmin'))).toEqual({ label: 'Approve alone (Admin)', reason: null });
  });

  it('a SITE bundle needs a SuperAdmin, alone too; an Admin cannot', () => {
    const site = bundle({ scopeKind: 'SITE', layers: [layer('FACTORY', {}), layer('SITE', { 'G4.min_samples': 40 })] });
    expect(bundleApproveRule(site, bob('Admin')).reason).toBe('A plant-wide bundle needs a SuperAdmin to approve it.');
    expect(bundleApproveRule(site, alice('Admin')).reason).toBe('A plant-wide bundle needs a SuperAdmin to approve it.');
    expect(bundleApproveRule(site, alice('SuperAdmin'))).toEqual({ label: 'Approve alone (Admin)', reason: null });
  });

  it('CHG-224: no property needs a SuperAdmin any more - an objective or a test permission is not edited in Gate Configuration', () => {
    expect(SUPERADMIN_PROPERTIES).toEqual([]);
    const profile = bundle({ scopeKind: 'PROFILE', layers: [layer('FACTORY', {}), layer('PROFILE', { 'G3.objective_type': 'TIGHT', 'G14.allowed_evidence_types': ['SERVO_STEP'] })],
      resolved: { properties: { 'G3.objective_type': 'TIGHT', 'G14.allowed_evidence_types': ['SERVO_STEP'] }, sources: {}, execution_plan: {} } });
    expect(needsSuperAdmin(profile)).toBeNull();
    expect(bundleApproveRule(profile, bob('Admin'))).toEqual({ label: 'Approve', reason: null });
  });
});
