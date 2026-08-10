"""
V2 pipeline validation â€” endpoint configuration.

Every value is env-overridable. Defaults are HOST-port form (for running the suite from the host against
the mapped docker ports). The containerized runner (infra/docker/docker-compose.sims.yml â†’ v2-validator)
overrides these with the INTERNAL service DNS names on the ams-backend network.
"""
import os

# â”€â”€ Traverse / AMS services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
AUTH_BASE     = os.getenv("V2_AUTH_BASE",     "http://localhost:8081")   # container: http://auth-service:3002
DISPLAY_BASE  = os.getenv("V2_DISPLAY_BASE",  "http://localhost:8081/api")   # container: http://display-service:5000
ANALYSIS_BASE = os.getenv("V2_ANALYSIS_BASE", "http://localhost:8081/api")   # container: http://analysis-service:5000
BINDING_BASE  = os.getenv("V2_BINDING_BASE",  "http://localhost:8081/api/bindings")   # container: http://binding-resolver:5000
HIST_BASE     = os.getenv("V2_HIST_BASE",     "http://localhost:8081/api/hist")   # container: http://historian-bff:8090
ASSET_BASE    = os.getenv("V2_ASSET_BASE",    "http://localhost:8081/api")   # container: http://asset-model:5000
AUDIT_BASE    = os.getenv("V2_AUDIT_BASE",    "http://localhost:8081")   # container: http://audit-service:8080

# â”€â”€ Infra â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
REDIS_HOST = os.getenv("V2_REDIS_HOST", "localhost")   # container: redis
REDIS_PORT = int(os.getenv("V2_REDIS_PORT", "6380"))   # container: 6379

# â”€â”€ Credentials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# The bootstrap admin (compose AUTH_BOOTSTRAP_USERNAME / _PASSWORD). Admin has every permission, so a
# single token exercises display-service (RS256-only) AND the TraverseAuth services.
ADMIN_USER = os.getenv("V2_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("V2_ADMIN_PASS", "ChangeMe123!")
# Shared internal service key (analysis/binding/historian accept it; display-service does NOT).
SERVICE_KEY = os.getenv("V2_SERVICE_KEY", "traverse-internal-dev-key")

# â”€â”€ Test inputs (must exist in the live plane â€” the simulator publishes these) â”€
# Two real process tags used as calculation inputs; their UNS paths + the derived output path.
CALC_INPUT_A = os.getenv("V2_CALC_INPUT_A", "houston/crude1/pump101.speed")
CALC_INPUT_B = os.getenv("V2_CALC_INPUT_B", "houston/crude1/pump101.discharge_press")
CALC_OUTPUT  = os.getenv("V2_CALC_OUTPUT",  "houston/derived/e2ecalc.avg")

# â”€â”€ Timing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
WAIT_COMPUTE_SEC = int(os.getenv("V2_WAIT_COMPUTE_SEC", "75"))   # time for Flink to evaluate + consumer to close
WAIT_AUDIT_SEC   = int(os.getenv("V2_WAIT_AUDIT_SEC", "20"))     # time for the audit hash-chain consumer
POLL_SEC         = float(os.getenv("V2_POLL_SEC", "3"))
