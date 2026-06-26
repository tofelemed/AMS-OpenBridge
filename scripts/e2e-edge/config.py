"""Edge platform E2E — endpoint configuration (override via env vars)."""
import os

# Kafka (host → Docker external listener, or in-container via docker exec)
KAFKA_BOOTSTRAP = os.getenv("E2E_KAFKA_BOOTSTRAP", "localhost:9093")
KAFKA_DOCKER_CONTAINER = os.getenv("E2E_KAFKA_DOCKER", "ams-kafka")
# "true" = always docker exec; "false" = host:9093; "auto" = try host then docker
KAFKA_VIA_DOCKER = os.getenv("E2E_KAFKA_VIA_DOCKER", "true")
TOPIC_RAW_ALARMS = os.getenv("E2E_TOPIC_RAW_ALARMS", "raw-alarms")
TOPIC_CURRENT_STATE = os.getenv("E2E_TOPIC_CURRENT_STATE", "current-alarm-state")
TOPIC_LIVE_ALARMS = os.getenv("E2E_TOPIC_LIVE_ALARMS", "live.alarms")
TOPIC_LIVE_METRICS = os.getenv("E2E_TOPIC_LIVE_METRICS", "live.metrics")

# Services
API_BASE = os.getenv("E2E_API_BASE", "http://localhost:8000")
BFF_BASE = os.getenv("E2E_BFF_BASE", "http://localhost:8090")
BFF_VIA_NGINX = os.getenv("E2E_BFF_NGINX", "http://localhost:3000/api/hist")
IOTDB_REST = os.getenv("E2E_IOTDB_REST", "http://localhost:8181")
PROMETHEUS = os.getenv("E2E_PROMETHEUS", "http://localhost:9090")
FRONTEND = os.getenv("E2E_FRONTEND", "http://localhost:3000")

# MQTT / Sparkplug
MQTT_HOST = os.getenv("E2E_MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("E2E_MQTT_PORT", "8083"))
MQTT_PATH = os.getenv("E2E_MQTT_PATH", "/mqtt")
SPARKPLUG_GROUP = os.getenv("E2E_SPARKPLUG_GROUP", "ams_site1")
SPARKPLUG_EDGE = os.getenv("E2E_SPARKPLUG_EDGE", "ams_edge1")

# PostgreSQL
PG_HOST = os.getenv("E2E_PG_HOST", "localhost")
PG_PORT = int(os.getenv("E2E_PG_PORT", "5433"))
PG_DB = os.getenv("E2E_PG_DB", "ams")
PG_USER = os.getenv("E2E_PG_USER", "ams_user")
PG_PASS = os.getenv("E2E_PG_PASS", "supersecurepassword123")

# IoTDB auth
IOTDB_USER = os.getenv("E2E_IOTDB_USER", "root")
IOTDB_PASS = os.getenv("E2E_IOTDB_PASS", "root")

# Test data prefix — unique per run
TEST_PREFIX = os.getenv("E2E_TEST_PREFIX", "E2E")
TEST_SERVER_ID = os.getenv("E2E_SERVER_ID", "e2e-server-001")

FLINK_UI = os.getenv("E2E_FLINK_UI", "http://localhost:8082")

# Timing
WAIT_FLINK_SEC = int(os.getenv("E2E_WAIT_FLINK_SEC", "180"))
WAIT_IOTDB_SEC = int(os.getenv("E2E_WAIT_IOTDB_SEC", "120"))
WAIT_MQTT_SEC = int(os.getenv("E2E_WAIT_MQTT_SEC", "90"))
WAIT_API_SEC = int(os.getenv("E2E_WAIT_API_SEC", "120"))
POLL_INTERVAL_SEC = float(os.getenv("E2E_POLL_INTERVAL_SEC", "3"))
