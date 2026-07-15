# V2 pipeline validation (Phases 5–7)

End-to-end validation of the V2 work against a **running** stack, plus a **live-data simulator** so the
compute pipeline has real process values to work with. Everything runs in containers so it is
re-runnable.

## What it checks

| Area | Checks |
|---|---|
| **Governance (P5)** | display create/save/publish, version history, tag filter + search + sort, folders, personal views, favorites, recent, CQRS-rejects-process-values, **ownership 403** (a non-owner Engineer cannot edit another user's display), **audit trail** (governance events land in audit-service) |
| **Compute (P7)** | create a calculation → execute → the **full Flink loop closes** the execution (analysis-service → `analysis.executions` → `AnalysisExecutionJob` → `analysis.results` → result consumer → `completed`) → the **derived measurement is published to the UNS** (Redis snapshot + asset-model registration); calc **versioning** |
| **Fidelity (P4/6)** | asset-model unit/limits `by-path`, historian `/summary` aggregate |
| **Authz (P7.5)** | binding-resolver resolves a tag (no-scope backward-compat). Positive scope-denial needs an `assetScope`-claimed token, which auth-service does not mint yet — documented, skipped |

Skips never fail the run — a check that needs data/services that aren't present is reported `SKIP`
with the reason. Exit code is non-zero only on a real `FAIL`.

## Prerequisites

1. **Main stack up** (`.\run-all.ps1`). This now includes the newly-added **audit-service**
   (`docker compose up -d --build audit-service` if you started the stack before this change).
2. **Flink JAR built with the Phase-7 job** so the compute loop is live:
   ```powershell
   .\scripts\build-flink-jar.ps1
   ```
   Then submit it (the launcher can do this with `-EnsureFlink`).
3. **Admin user seeded** in auth-service (compose bootstraps `admin` / `ChangeMe123!` by default).

## Run it (one command)

```powershell
.\scripts\run-v2-validation.ps1 -EnsureFlink      # first run: also submits Flink jobs
.\scripts\run-v2-validation.ps1                   # subsequent runs (sim already up)
.\scripts\run-v2-validation.ps1 -Down             # stop the simulator
```

## Run the pieces by hand

```powershell
$C = '-f','infra/docker/docker-compose.yml','-f','infra/docker/docker-compose.sims.yml'

# live data
docker compose @C up -d --build ams-sim

# validate
docker compose @C run --rm v2-validator
```

Run the suite directly from the host (against mapped ports) instead of in a container:

```powershell
pip install -r scripts/e2e-v2/requirements.txt
python scripts/e2e-v2/validate_v2.py
```

## Configuration

All endpoints/credentials are env vars (see `config.py`). Host defaults target the mapped docker ports;
the containerized `v2-validator` overrides them with internal service DNS. Useful overrides:

| Var | Default (host) | Meaning |
|---|---|---|
| `V2_ADMIN_USER` / `V2_ADMIN_PASS` | `admin` / `ChangeMe123!` | auth-service login |
| `V2_CALC_INPUT_A` / `_B` | `houston/crude1/pump101.speed` / `.discharge_press` | calculation inputs |
| `V2_CALC_OUTPUT` | `houston/derived/e2ecalc.avg` | derived measurement path |
| `V2_WAIT_COMPUTE_SEC` | `75` | how long to wait for the Flink loop |

## Interpreting a failed compute check

If `compute.flinkLoopRan` fails with *"execution left 'pending'"*, the `AnalysisExecutionJob` is not
running — rebuild the Flink JAR (`build-flink-jar.ps1`) and submit it (`-EnsureFlink`). If
`compute.inputsLive` **skips**, the simulator isn't feeding — check `ams-sim` logs and that the
sparkplug-edge-node is bridging `live.metrics` to Redis.
