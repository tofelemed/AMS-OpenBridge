package com.ams.sparkplug;

/**
 * Configuration loaded from environment variables.
 * All fields have safe defaults for local dev inside Docker Compose.
 */
public final class SparkplugConfig {

    // Kafka
    public final String kafkaBrokers;
    public final String liveAlarmsTopic;
    public final String liveMetricsTopic;
    /** CPLM loop metrics (Phase 6.1): loop-scoped PV/SP/OP/VP/MODE via report-by-exception. */
    public final String liveLoopMetricsTopic;
    public final String kafkaGroupId;
    /** Kafka auto.offset.reset — "earliest" to replay history, "latest" for real-time only */
    public final String kafkaAutoOffsetReset;

    // MQTT / EMQX
    public final String mqttHost;
    public final int    mqttPort;
    public final String mqttClientId;
    /** true = ws:// (WebSocket), false = tcp:// */
    public final boolean mqttWs;
    /** Phase 6: MQTT credentials — null means anonymous (dev only). */
    public final String mqttUsername;
    public final String mqttPassword;

    // Sparkplug B identity
    public final String sparkplugGroup;
    public final String sparkplugEdge;

    // Redis (CONTRACT tier — snapshot:* / alias:* paint-on-open keys, DATA-03)
    public final String redisHost;
    public final int    redisPort;
    /** requirepass credential — null means no auth (dev only). */
    public final String redisPassword;
    /** TTL in seconds for snapshot keys. */
    public final int    redisTtlSeconds;

    private SparkplugConfig(
            String kafkaBrokers, String liveAlarmsTopic, String liveMetricsTopic, String liveLoopMetricsTopic, 
            String kafkaGroupId, String kafkaAutoOffsetReset,
            String mqttHost, int mqttPort, String mqttClientId, boolean mqttWs,
            String mqttUsername, String mqttPassword,
            String sparkplugGroup, String sparkplugEdge,
            String redisHost, int redisPort, String redisPassword, int redisTtlSeconds) {
        this.kafkaBrokers          = kafkaBrokers;
        this.liveAlarmsTopic       = liveAlarmsTopic;
        this.liveMetricsTopic      = liveMetricsTopic;
        this.liveLoopMetricsTopic  = liveLoopMetricsTopic;
        this.kafkaGroupId          = kafkaGroupId;
        this.kafkaAutoOffsetReset  = kafkaAutoOffsetReset;
        this.mqttHost         = mqttHost;
        this.mqttPort         = mqttPort;
        this.mqttClientId     = mqttClientId;
        this.mqttWs           = mqttWs;
        this.mqttUsername     = mqttUsername;
        this.mqttPassword     = mqttPassword;
        this.sparkplugGroup   = sparkplugGroup;
        this.sparkplugEdge    = sparkplugEdge;
        this.redisHost        = redisHost;
        this.redisPort        = redisPort;
        this.redisPassword    = redisPassword;
        this.redisTtlSeconds  = redisTtlSeconds;
    }

    public static SparkplugConfig fromEnv() {
        return new SparkplugConfig(
                env("KAFKA_BROKERS",            "kafka:9092"),
                env("LIVE_ALARMS_TOPIC",        "live.alarms"),
                env("LIVE_METRICS_TOPIC",       "live.metrics"),
                env("LIVE_LOOP_METRICS_TOPIC",  "live.loop.metrics"),
                env("KAFKA_GROUP_ID",           "ams-sparkplug-edge-node"),
                env("KAFKA_AUTO_OFFSET_RESET",  "earliest"),  // earliest = replay on startup
                env("MQTT_HOST",                "emqx"),
                intEnv("MQTT_PORT",       1883),
                env("MQTT_CLIENT_ID",     "ams-edge-node-1"),
                boolEnv("MQTT_WS",        false),
                envOrNull("MQTT_USERNAME"),
                envOrNull("MQTT_PASSWORD"),
                env("SPARKPLUG_GROUP",    "ams_site1"),
                env("SPARKPLUG_EDGE",     "ams_edge1"),
                env("REDIS_HOST",         "redis-contract"),
                intEnv("REDIS_PORT",      6379),
                envOrNull("REDIS_PASSWORD"),
                intEnv("REDIS_TTL_SECS",  3600)
        );
    }

    /** MQTT broker URI — tcp:// or ws:// depending on MQTT_WS flag. */
    public String mqttBrokerUri() {
        String scheme = mqttWs ? "ws" : "tcp";
        String path   = mqttWs ? "/mqtt" : "";
        return scheme + "://" + mqttHost + ":" + mqttPort + path;
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return (v != null && !v.isBlank()) ? v : def;
    }

    private static String envOrNull(String key) {
        String v = System.getenv(key);
        return (v != null && !v.isBlank()) ? v : null;
    }

    private static int intEnv(String key, int def) {
        try { return Integer.parseInt(System.getenv(key)); } catch (Exception e) { return def; }
    }

    private static boolean boolEnv(String key, boolean def) {
        String v = System.getenv(key);
        return v != null ? Boolean.parseBoolean(v) : def;
    }
}
