# Alarm Architecture & Workflow Analysis

A code-backed reconstruction of the AMS/CAMS alarm pipeline, produced 2026-08-25 against commit
`2886ccb` (branch `main`, clean working tree).

**Nothing in these documents is taken from existing architecture docs.** Every claim was traced to a
producer call site, a consumer call site, an SQL definition, or a component render. Where the docs and
the code disagree, the code wins and the delta is recorded in `12-documentation-drift.md`.

## Read in this order

| # | File | What it answers |
|---|---|---|
| — | [DECISION-BRIEF.md](DECISION-BRIEF.md) | **For the product owner and the incoming developer.** Every open decision (D1–D31) with options and a recommendation, the prioritised fault list, and a build order. Start here if you are deciding or building rather than auditing. |
| 00 | [00-executive-summary.md](00-executive-summary.md) | The consolidated verdict and recommended next steps |
| 11 | [11-architecture-reconstruction.md](11-architecture-reconstruction.md) | **Start here for the shape of the system** — full pipeline diagram, ACK sequence, path classification |
| 12 | [12-documentation-drift.md](12-documentation-drift.md) | Which documented components do not exist |

## Per-area detail

| # | File | Scope |
|---|---|---|
| 01 | [01-source-and-ingestion.md](01-source-and-ingestion.md) | Where alarm data actually comes from |
| 02 | [02-flink-jobs.md](02-flink-jobs.md) | Flink jobs, the ISA-18.2 state machine, DLQ reality |
| 03 | [03-backend-services.md](03-backend-services.md) | .NET services, endpoints, the SignalR contract |
| 04 | [04-kafka-architecture.md](04-kafka-architecture.md) | Full topic census, orphans, serialization mismatches |
| 05 | [05-operations-tab.md](05-operations-tab.md) | Every Operations page traced to its backend |
| 06 | [06-dcs-writeback.md](06-dcs-writeback.md) | Whether anything reaches a DCS |
| 07 | [07-database-and-state.md](07-database-and-state.md) | Tables, hypertables, where authoritative state lives |
| 08 | [08-business-logic.md](08-business-logic.md) | 18 alarm capabilities, graded |
| 09 | [09-dead-code-and-hardcoded.md](09-dead-code-and-hardcoded.md) | Dead code, mock data, hardcoded values |
| 10 | [10-bugs-and-issues.md](10-bugs-and-issues.md) | Adversarial defect review, by severity |

## Status legend used throughout

| Marker | Meaning |
|---|---|
| ✅ **Implemented** | Real code on both ends, wired in the default deployment |
| 🟡 **Partial** | Works, but a documented part of the contract is absent or defective |
| 🟠 **Placeholder** | Code exists and returns success without performing the action |
| 🔴 **Broken** | Both ends exist but cannot interoperate |
| ⚫ **Dead** | One end has no counterpart; nothing flows |

## Method notes for anyone repeating this work

- **`src/xmlgraphics-batik-main ScreeN Import/` no longer exists.** `CLAUDE.md:23` still instructs
  agents to ignore it; that instruction is stale and worth removing. `src/` now contains only
  `backend`, `flink`, `frontend-ob`, `services`, and one markdown file.
- The real search hazard is **`CPA/`** — an untracked 6,824-file tree at the repo root
  (`git ls-files CPA` returns 0). A plain recursive `grep -r` from the repo root times out on it.
  Use `rg --glob '!CPA/**'`.
- Claims marked **Unknown / Requires Verification** could not be settled from the code alone and need a
  running system or access to out-of-repo components.
- This was an analysis pass only. **No production code was modified.**
