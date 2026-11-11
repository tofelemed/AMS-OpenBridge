import { describe, expect, it } from 'vitest';
import { loopPens, penSpecsOf, rolesOf } from './loopPens';

const tags = { PV: 'root.hdpe.cpm.FIC1.pv', SP: 'root.hdpe.cpm.FIC1.sp', OP: 'root.hdpe.cpm.FIC1.op', VP: 'root.hdpe.cpm.FIC1.vp', MODE: 'root.hdpe.cpm.FIC1.mode' };

describe('loopPens', () => {
  it('loads PV, SP, OP and VP pens from the chosen loop, never MODE', () => {
    expect(loopPens({ tags })).toEqual([
      { tag: tags.PV, role: 'PV' }, { tag: tags.SP, role: 'SP' }, { tag: tags.OP, role: 'OP' }, { tag: tags.VP, role: 'VP' },
    ]);
  });

  it('gives a loop with no VP tag no VP pen, and a loop with no tags none', () => {
    expect(loopPens({ tags: { PV: 'a', SP: 'b', OP: 'c' } }).map(p => p.role)).toEqual(['PV', 'SP', 'OP']);
    expect(loopPens({ tags: {} })).toEqual([]);
  });

  it('keeps one pen when two roles share a tag', () => {
    expect(loopPens({ tags: { PV: 'a', SP: 'a' } })).toEqual([{ tag: 'a', role: 'PV' }]);
  });

  it('filters by role before it dedupes, so a shared tag still draws for the role asked', () => {
    expect(loopPens({ tags: { PV: 'a', SP: 'a' } }, ['SP'])).toEqual([{ tag: 'a', role: 'SP' }]);
    expect(loopPens({ tags: { PV: 'a', SP: 'a' } }, [])).toEqual([]);
  });
});

describe('rolesOf', () => {
  it('reads none as an explicit empty set, and nothing valid as all', () => {
    expect(rolesOf('none')).toEqual([]);
    expect(rolesOf(null)).toEqual(['PV', 'SP', 'OP', 'VP']);
    expect(rolesOf('sp,x')).toEqual(['SP']);
  });
});

describe('penSpecsOf', () => {
  it('colours pens by role, not position, and draws the setpoint dashed', () => {
    const specs = penSpecsOf(loopPens({ tags: { OP: 'c', SP: 'b' } }));
    expect(specs.find(s => s.path === 'b')).toMatchObject({ color: 'var(--signal-sp)', lineStyle: 'dashed', label: 'SP' });
    expect(specs.find(s => s.path === 'c')).toMatchObject({ color: 'var(--signal-op)', label: 'OP' });
  });

  it('limits the pens to the roles asked for', () => {
    expect(penSpecsOf(loopPens({ tags }, ['PV', 'OP'])).map(s => s.label)).toEqual(['PV', 'OP']);
  });

  it('marks every loop pen as needing a binding from the asset model (CHG-175)', () => {
    expect(penSpecsOf(loopPens({ tags })).every(s => s.needsModelBinding === true)).toBe(true);
  });
});
