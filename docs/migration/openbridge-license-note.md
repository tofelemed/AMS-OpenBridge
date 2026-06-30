# OpenBridge License & Dependency Note

**Document:** Phase 0 Foundation  
**Status:** AUTHORITATIVE  
**Date:** 2026-06-30

---

## 1. Package Information

### 1.1 Current Dependencies (AMS frontend-ob)

```json
{
  "@oicl/openbridge-webcomponents": "^1.0.1",
  "@oicl/openbridge-webcomponents-react": "^1.0.1"
}
```

### 1.2 Source

- **Registry:** npm (public)
- **Repository:** https://github.com/oicl-platform/openbridge-webcomponents
- **Organization:** Ocean Industries Concept Lab (OICL)

---

## 2. License

### 2.1 Current License

**Apache License 2.0** (as of v1.0.0, March 2026)

The OpenBridge web components are released under the Apache 2.0 license, which permits:
- Commercial use
- Modification
- Distribution
- Patent use
- Private use

With conditions:
- License and copyright notice must be included
- State changes if modified

### 2.2 License History

| Version | Release Date | License | Notes |
|---------|--------------|---------|-------|
| < 1.0.0 | Pre-March 2026 | AGPL-3.0 | Early/unstable |
| 1.0.0+ | March 2026 | Apache-2.0 | Stable release |

### 2.3 AGPL Transition

Per the feasibility plan (§9):

> "OpenBridge delayed license: current releases are AGPL for 6 months, then Apache 2.0. For a commercial Traverse product, build on Apache-aged releases or obtain member early-access; do not ship AGPL-current code without legal review."

**Current status:** v1.0.1 is Apache-2.0 licensed. Safe for commercial use.

---

## 3. Dependency Policy

### 3.1 Pinning Strategy

**Pin to stable Apache-licensed releases only:**

```json
{
  "@oicl/openbridge-webcomponents": "1.0.1",
  "@oicl/openbridge-webcomponents-react": "1.0.1"
}
```

**Do NOT use:**
- `develop` / `next` tagged releases
- Pre-release versions (alpha, beta, rc)
- Versions < 1.0.0 (AGPL)

### 3.2 Update Policy

1. Review release notes before updating
2. Verify license remains Apache-2.0
3. Test all OpenBridge components in designer/runtime
4. Update in a separate PR with changelog reference

---

## 4. React Wrapper Advisory

### 4.1 Current State

The OpenBridge React wrapper (`@oicl/openbridge-webcomponents-react`) was:
- Partner-only until March 2026
- Early/unstable (v0.0.17 when partner-only)
- Now v1.0.1 and public

### 4.2 Usage Pattern

Per the feasibility plan (§3.1):

> "AMS already consumes the **core** web components, which is the right pattern: depend on the framework-agnostic core and keep a thin custom React binding rather than coupling to the early wrapper."

**Recommended approach:**

```typescript
// Direct web component usage (preferred)
import '@oicl/openbridge-webcomponents/dist/components/gauge/gauge.js';

// In JSX
<obc-gauge value={42} min={0} max={100} />
```

**If using React wrapper:**

```typescript
// React wrapper (acceptable but monitor stability)
import { ObcGauge } from '@oicl/openbridge-webcomponents-react';

<ObcGauge value={42} min={0} max={100} />
```

---

## 5. Component Inventory

### 5.1 Used in AMS Today

| Component | Usage |
|-----------|-------|
| Gauges (linear, radial) | Dashboard indicators |
| Status indicators | System status |
| Alerts/notifications | Alarm banners |
| Navigation components | App chrome |

### 5.2 Planned for Designer (Phase 2+)

| Component | Usage |
|-----------|-------|
| All gauges | Palette items |
| Automation components | Process symbols |
| Data display | Value indicators |
| Theme variables | Consistent styling |

---

## 6. ISA-5.1 Gap

OpenBridge does not include complete ISA-5.1 process symbols:

| Missing | Resolution |
|---------|------------|
| Valves (gate, globe, ball, control) | Theme-aware SVG |
| Pumps (centrifugal, PD) | Theme-aware SVG |
| Motors | Theme-aware SVG |
| Vessels (tanks, drums, columns) | Theme-aware SVG |
| Heat exchangers | Theme-aware SVG |
| Piping | SVG paths |

**Path forward:** Author as theme-aware SVGs using OpenBridge color tokens (`--obc-*` CSS variables), following the Figma-to-SVG export pattern documented in OpenBridge 5.0.

---

## 7. Compliance Checklist

- [x] Verify current license is Apache-2.0
- [x] Pin to stable release (1.0.1)
- [x] Document in MIGRATION_LOG.md
- [ ] Legal review completed (if required by organization)
- [ ] Attribute license in NOTICE file (if distributing)

---

## 8. References

- [OpenBridge GitHub](https://github.com/oicl-platform/openbridge-webcomponents)
- [OpenBridge Documentation](https://oicl-platform.github.io/openbridge-webcomponents/)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Feasibility Plan §3.1, §9, §12](../src/Unified-HMI-Platform-Feasibility-and-Transition-Plan.md)
