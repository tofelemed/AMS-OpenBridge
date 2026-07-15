"""
V2 pipeline validation — endpoint configuration.

Every value is env-overridable. Defaults are HOST-port form (for running the suite from the host against
the mapped docker ports). The containerized runner (infra/docker/docker-compose.sims.yml → v2-validator)
overrides these with the INTERNAL service DNS names on the ams-backend network.
"""
import os

# ── Traverse / AMS services ───────────────────────────────────────────────────
AUTH_BASE     = os.getenv("V2_AUTH_BASE",     "http://localhost:3002")   # container: http://auth-service:3002
DISPLAY_BASE  = os.getenv("V2_DISPLAY_BASE",  "http://localhost:5003")   # container: http://display-service:5000
ANALYSIS_BASE = os.getenv("V2_ANALYSIS_BASE", "http://localhost:5005")   # container: http://analysis-service:5000
BINDING_BASE  = os.getenv("V2_BINDING_BASE",  "http://localhost:5002")   # container: http://binding-resolver:5000
HIST_BASE     = os.getenv("V2_HIST_BASE",     "http://localhost:8090")   # container: http://historian-bff:8090
ASSET_BASE    = os.getenv("V2_ASSET_BASE",    "http://localhost:5001")   # container: http://asset-model:5000
AUDIT_BASE    = os.getenv("V2_AUDIT_BASE",    "http://localhost:8095")   # container: http://audit-service:8080

# ── Infra ─────────────────────────────────────────────────────────────────────
REDIS_HOST = os.getenv("V2_REDIS_HOST", "localhost")   # container: redis
REDIS_PORT = int(os.getenv("V2_REDIS_PORT", "6380"))   # container: 6379

# ── Credentials ───────────────────────────────────────────────────────────────
# The bootstrap admin (compose AUTH_BOOTSTRAP_USERNAME / _PASSWORD). Admin has every permission, so a
# single token exercises display-service (RS256-only) AND the TraverseAuth services.
ADMIN_USER = os.getenv("V2_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("V2_ADMIN_PASS", "ChangeMe123!")
# Shared internal service key (analysis/binding/historian accept it; display-service does NOT).
SERVICE_KEY = os.getenv("V2_SERVICE_KEY", "traverse-internal-dev-key")

# ── Test inputs (must exist in the live plane — the simulator publishes these) ─
# Two real process tags used as calculation inputs; their UNS paths + the derived output path.
CALC_INPUT_A = os.getenv("V2_CALC_INPUT_A", "houston/crude1/pump101.speed")
CALC_INPUT_B = os.getenv("V2_CALC_INPUT_B", "houston/crude1/pump101.discharge_press")
CALC_OUTPUT  = os.getenv("V2_CALC_OUTPUT",  "houston/derived/e2ecalc.avg")

# ── Timing ────────────────────────────────────────────────────────────────────
WAIT_COMPUTE_SEC = int(os.getenv("V2_WAIT_COMPUTE_SEC", "75"))   # time for Flink to evaluate + consumer to close
WAIT_AUDIT_SEC   = int(os.getenv("V2_WAIT_AUDIT_SEC", "20"))     # time for the audit hash-chain consumer
POLL_SEC         = float(os.getenv("V2_POLL_SEC", "3"))
