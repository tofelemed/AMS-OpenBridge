# Inventory deltas against the deep analysis

Baseline: the committed analysis data, measured at `0b081f4d` and the same at `16184182`-era source. Current: the Phase 0 commits, which add the focus helper and `PermissionCheckbox`.

## Source inventory, live files

| Measure | Baseline | Now |
|---|---|---|
| files | 322 | 324 |
| colourDecl | 2000 | 2000 |
| declToken | 1827 | 1827 |
| declLiteral | 46 | 46 |
| declIndirect | 127 | 127 |
| hex | 130 | 130 |
| rgb | 41 | 41 |
| colorMix | 34 | 34 |
| varFallbackLiteral | 124 | 124 |
| inlineColourProps | 361 | 361 |
| tRefs | 488 | 488 |
| varRefs | 1611 | 1611 |
| readinessPct | 97.5 | 97.5 |

## Component inventory: types whose use count changed

| Type | Baseline | Now |
|---|---|---|
| input | 89 | 90 |
| ObcCheckbox | 1 | 0 |
| PermissionCheckbox @ components/Administration/PermissionCheckbox.tsx | 0 | 1 |
