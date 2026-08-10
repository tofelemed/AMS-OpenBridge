"""Edge platform E2E â€” endpoint configuration (override via env vars)."""
import os

# Kafka (host â†’ Docker external listener, or in-container via docker exec)
KAFKA_BOOTSTRAP = os.getenv("E2E_KAFKA_BOOTSTRAP", "localhost:9093")
KAFKA_DOCKER_CONTAINER = os.getenv("E2E_KAFKA_DOCKER", "ams-kafka")
# "true" = always docker exec; "false" = host:9093; "auto" = try host then docker
KAFKA_VIA_DOCKER = os.getenv("E2E_KAFKA_VIA_DOCKER", "true")
TOPIC_RAW_ALARMS = os.getenv("E2E_TOPIC_RAW_ALARMS", "raw-alarms")
TOPIC_CURRENT_STATE = os.getenv("E2E_TOPIC_CURRENT_STATE", "current-alarm-state")
TOPIC_LIVE_ALARMS = os.getenv("E2E_TOPIC_LIVE_ALARMS", "live.alarms")
TOPIC_LIVE_METRICS = os.getenv("E2E_TOPIC_LIVE_METRICS", "live.metrics")

# Services
API_BASE = os.getenv("E2E_API_BASE", "http://localhost:8081")
BFF_BASE = os.getenv("E2E_BFF_BASE", "http://localhost:8081/api/hist")
BFF_VIA_NGINX = os.getenv("E2E_BFF_NGINX", "http://localhost:3000/api/hist")
IOTDB_REST = os.getenv("E2E_IOTDB_REST", "http://localhost:8181")
PROMETHEUS = os.getenv("E2E_PROMETHEUS", "http://localhost:9090")
FRONTEND = os.getenv("E2E_FRONTEND", "http://localhost:3000")

# MQTT / Sparkplug
# E2E_MQTT_PORT  â€” raw TCP listener (paho-mqtt plain TCP).  Default: 1883.
#                  Use 8083 only when connecting via WebSocket transport.
MQTT_HOST = os.getenv("E2E_MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("E2E_MQTT_PORT", "1883"))
MQTT_WS_PORT = int(os.getenv("E2E_MQTT_WS_PORT", "8083"))
MQTT_PATH = os.getenv("E2E_MQTT_PATH", "/mqtt")
# Credentials for EMQX (ALLOW_ANONYMOUS=false).  Must match docker-compose EMQX_EDGE_USER/PASSWORD.
MQTT_USERNAME = os.getenv("E2E_MQTT_USERNAME", "ams_edge")
MQTT_PASSWORD = os.getenv("E2E_MQTT_PASSWORD", "changeme_edge")
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

# Test data prefix â€” unique per run
TEST_PREFIX = os.getenv("E2E_TEST_PREFIX", "E2E")
# CRITICAL: Must be a valid GUID â€” NormalizedAlarmIngestor drops non-GUID serverIds!
# Using the same GUID configured in docker-compose AlarmIngestion__ServerId
TEST_SERVER_ID = os.getenv("E2E_SERVER_ID", "f0af9a6d-85f6-4c9f-a8ad-6de277d1d110")

FLINK_UI = os.getenv("E2E_FLINK_UI", "http://localhost:8082")

# Timing
WAIT_FLINK_SEC = int(os.getenv("E2E_WAIT_FLINK_SEC", "180"))
WAIT_IOTDB_SEC = int(os.getenv("E2E_WAIT_IOTDB_SEC", "120"))
WAIT_MQTT_SEC = int(os.getenv("E2E_WAIT_MQTT_SEC", "90"))
WAIT_API_SEC = int(os.getenv("E2E_WAIT_API_SEC", "120"))
POLL_INTERVAL_SEC = float(os.getenv("E2E_POLL_INTERVAL_SEC", "3"))
