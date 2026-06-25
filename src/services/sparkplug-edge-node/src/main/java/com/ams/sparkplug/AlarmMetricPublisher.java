package com.ams.sparkplug;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.eclipse.tahu.message.SparkplugBPayloadEncoder;
import org.eclipse.tahu.message.model.*;
import org.apache.kafka.clients.consumer.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.Pipeline;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Core loop: Kafka(live.alarms, live.metrics) → Sparkplug B DDATA → EMQX.
 *
 * Protocol flow (Sparkplug B spec §6):
 *   1. Connect to EMQX with NDEATH as Last-Will.
 *   2. Publish NBIRTH (node birth certificate, bdSeq).
 *   3. For every new deviceId seen: publish DBIRTH (metric list + aliases).
 *   4. For every Kafka message: publish DDATA (alias only, no name).
 *   5. On connectionLost: re-issue NBIRTH + DBIRTH on reconnect.
 *
 * Redis writes (best-effort):
 *   snapshot:metric:<group>:<edge>:<device>:<metricName>  → JSON {v,q,ts}
 *   alias:<group>:<edge>                                   → Hash { alias: name }
 */
public class AlarmMetricPublisher implements MqttCallbackExtended {

    private static final Logger LOG = LoggerFactory.getLogger(AlarmMetricPublisher.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MQTT_QOS = 0;

    private final SparkplugConfig      cfg;
    private final MetricAliasRegistry  aliases;
    private final JedisPool            jedisPool;
    private final Set<String>          bornDevices = Collections.synchronizedSet(new HashSet<>());
    private final AtomicLong           bdSeq       = new AtomicLong(0);
    private final AtomicLong           seq         = new AtomicLong(0);

    private volatile MqttClient mqttClient;
    private volatile boolean    running = true;

    // Sparkplug topic prefixes
    private final String topicNBirth;
    private final String topicNDeath;

    public AlarmMetricPublisher(SparkplugConfig cfg) {
        this.cfg  = cfg;
        JedisPoolConfig poolCfg = new JedisPoolConfig();
        poolCfg.setMaxTotal(4);
        this.jedisPool = new JedisPool(poolCfg, cfg.redisHost, cfg.redisPort);
        this.aliases   = new MetricAliasRegistry(jedisPool, cfg.sparkplugGroup, cfg.sparkplugEdge);
        this.topicNBirth = "spBv1.0/" + cfg.sparkplugGroup + "/NBIRTH/" + cfg.sparkplugEdge;
        this.topicNDeath = "spBv1.0/" + cfg.sparkplugGroup + "/NDEATH/" + cfg.sparkplugEdge;
    }

    /** Blocks indefinitely; handles connect, reconnect, and Kafka poll loop. */
    public void start() {
        connectMqtt();

        Properties kProps = new Properties();
        kProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG,  cfg.kafkaBrokers);
        kProps.put(ConsumerConfig.GROUP_ID_CONFIG,           cfg.kafkaGroupId);
        kProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG,  "latest");
        kProps.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");
        kProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,
                "org.apache.kafka.common.serialization.StringDeserializer");
        kProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,
                "org.apache.kafka.common.serialization.StringDeserializer");
        kProps.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "500");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(kProps)) {
            consumer.subscribe(List.of(cfg.liveAlarmsTopic, cfg.liveMetricsTopic));
            LOG.info("Kafka consumer subscribed to {} / {}",
                    cfg.liveAlarmsTopic, cfg.liveMetricsTopic);

            while (running) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
                for (ConsumerRecord<String, String> rec : records) {
                    try {
                        processRecord(rec);
                    } catch (Exception e) {
                        LOG.warn("Failed to process record from {}: {}", rec.topic(), e.getMessage());
                    }
                }
            }
        }
    }

    // ── MQTT callbacks ─────────────────────────────────────────────────────

    @Override
    public void connectComplete(boolean reconnect, String serverURI) {
        LOG.info("MQTT {} to {}", reconnect ? "reconnected" : "connected", serverURI);
        seq.set(0);
        bornDevices.clear();
        aliases.reset();
        try {
            publishNBirth();
        } catch (Exception e) {
            LOG.error("Failed to publish NBIRTH on connect", e);
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        LOG.warn("MQTT connection lost: {}", cause.getMessage());
    }

    @Override
    public void messageArrived(String topic, MqttMessage message) {}

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) {}

    // ── Core processing ────────────────────────────────────────────────────

    private void processRecord(ConsumerRecord<String, String> rec) throws Exception {
        if (rec.value() == null || rec.value().isBlank()) return;

        JsonNode node = MAPPER.readTree(rec.value());
        String alarmId = text(node, "alarmId");
        if (alarmId.isEmpty()) return;

        // Device = sanitised source name (or fallback to alarmId prefix)
        String source  = text(node, "sourceName");
        String deviceId = source.isEmpty()
                ? "alarm_" + alarmId.replace("-", "").substring(0, Math.min(8, alarmId.length()))
                : source.replaceAll("[^a-zA-Z0-9_\\-]", "_");

        // Ensure DBIRTH was published for this device
        if (!bornDevices.contains(deviceId)) {
            publishDBirth(deviceId, node);
            bornDevices.add(deviceId);
        }

        // Build DDATA payload (alias-only per Sparkplug spec)
        publishDData(deviceId, node);
        writeToRedis(deviceId, node);
    }

    // ── Sparkplug publish helpers ──────────────────────────────────────────

    private void publishNBirth() throws Exception {
        long bd = bdSeq.getAndIncrement();
        SparkplugBPayload payload = new SparkplugBPayload.SparkplugBPayloadBuilder(seq.getAndIncrement())
                .setTimestamp(new Date())
                .addMetric(new Metric.MetricBuilder("bdSeq", MetricDataType.Int64, bd).createMetric())
                .createPayload();

        // Last-Will (NDEATH) is set in connect options — also publish it here for clarity
        byte[] encoded = new SparkplugBPayloadEncoder().getBytes(payload, false);
        publishMqtt(topicNBirth, encoded, true);
        LOG.info("Published NBIRTH (bdSeq={})", bd);
    }

    private void publishDBirth(String deviceId, JsonNode seedNode) throws Exception {
        String topic = "spBv1.0/" + cfg.sparkplugGroup + "/DBIRTH/" + cfg.sparkplugEdge + "/" + deviceId;
        SparkplugBPayload.SparkplugBPayloadBuilder builder =
                new SparkplugBPayload.SparkplugBPayloadBuilder(seq.getAndIncrement())
                        .setTimestamp(new Date());

        // Declare all known metrics with name + alias
        for (String metricName : List.of("severity", "state", "acknowledged",
                "conditionActive", "priority", "sourceName", "conditionName", "message")) {
            long alias = aliases.aliasFor(metricName);
            Object seedValue = seedValue(seedNode, metricName);
            MetricDataType dtype = dataType(metricName);
            builder.addMetric(new Metric.MetricBuilder(metricName, dtype, seedValue)
                    .alias(alias)
                    .createMetric());
        }

        byte[] encoded = new SparkplugBPayloadEncoder().getBytes(builder.createPayload(), false);
        publishMqtt(topic, encoded, true);
        LOG.debug("Published DBIRTH for device '{}'", deviceId);
    }

    private void publishDData(String deviceId, JsonNode node) throws Exception {
        String topic = "spBv1.0/" + cfg.sparkplugGroup + "/DDATA/" + cfg.sparkplugEdge + "/" + deviceId;
        SparkplugBPayload.SparkplugBPayloadBuilder builder =
                new SparkplugBPayload.SparkplugBPayloadBuilder(seq.getAndIncrement())
                        .setTimestamp(new Date(node.has("rbeTs") ? node.get("rbeTs").asLong() : System.currentTimeMillis()));

        // DDATA: alias only (no name) — receiver resolves via DBIRTH alias map
        addAliasMetric(builder, "severity",       MetricDataType.Int32,   (long) intVal(node, "severity", 0));
        addAliasMetric(builder, "state",          MetricDataType.String,  text(node, "state"));
        addAliasMetric(builder, "acknowledged",   MetricDataType.Boolean, boolVal(node, "acknowledged"));
        addAliasMetric(builder, "conditionActive",MetricDataType.Boolean, boolVal(node, "conditionActive"));
        addAliasMetric(builder, "priority",       MetricDataType.String,  text(node, "priority"));
        addAliasMetric(builder, "sourceName",     MetricDataType.String,  text(node, "sourceName"));
        addAliasMetric(builder, "conditionName",  MetricDataType.String,  text(node, "conditionName"));
        addAliasMetric(builder, "message",        MetricDataType.String,  text(node, "message"));

        byte[] encoded = new SparkplugBPayloadEncoder().getBytes(builder.createPayload(), false);
        publishMqtt(topic, encoded, false);
    }

    private void addAliasMetric(SparkplugBPayload.SparkplugBPayloadBuilder builder,
                                String name, MetricDataType dtype, Object value) throws Exception {
        long alias = aliases.aliasFor(name);
        // Pass empty-string name — DDATA only needs alias; Sparkplug receivers resolve via DBIRTH
        builder.addMetric(new Metric.MetricBuilder("", dtype, value)
                .alias(alias)
                .createMetric());
    }

    // ── Redis snapshot writes ──────────────────────────────────────────────

    private void writeToRedis(String deviceId, JsonNode node) {
        String prefix = "snapshot:metric:" + cfg.sparkplugGroup + ":" +
                cfg.sparkplugEdge + ":" + deviceId + ":";
        long ts = node.has("rbeTs") ? node.get("rbeTs").asLong() : System.currentTimeMillis();

        try (Jedis jedis = jedisPool.getResource()) {
            Pipeline pipe = jedis.pipelined();
            writeSnapshotField(pipe, prefix + "severity",       intVal(node, "severity", 0),    ts);
            writeSnapshotField(pipe, prefix + "state",          text(node, "state"),             ts);
            writeSnapshotField(pipe, prefix + "acknowledged",   boolVal(node, "acknowledged"),   ts);
            writeSnapshotField(pipe, prefix + "conditionActive",boolVal(node, "conditionActive"),ts);
            writeSnapshotField(pipe, prefix + "priority",       text(node, "priority"),          ts);
            pipe.sync();
        } catch (Exception e) {
            LOG.debug("Redis write failed (non-fatal): {}", e.getMessage());
        }
    }

    private void writeSnapshotField(Pipeline pipe, String key, Object value, long ts) {
        String json = "{\"v\":" + valueJson(value) + ",\"q\":192,\"ts\":" + ts + "}";
        pipe.setex(key, cfg.redisTtlSeconds, json);
    }

    private String valueJson(Object v) {
        if (v instanceof String)  return "\"" + ((String) v).replace("\"", "\\\"") + "\"";
        if (v instanceof Boolean) return v.toString();
        return String.valueOf(v);
    }

    // ── MQTT low-level ─────────────────────────────────────────────────────

    private void connectMqtt() {
        for (int attempt = 1; attempt <= 20; attempt++) {
            try {
                mqttClient = new MqttClient(cfg.mqttBrokerUri(), cfg.mqttClientId,
                        new MemoryPersistence());
                mqttClient.setCallback(this);

                MqttConnectOptions opts = new MqttConnectOptions();
                opts.setCleanSession(true);
                opts.setKeepAliveInterval(30);
                opts.setConnectionTimeout(10);
                opts.setAutomaticReconnect(true);
                // Phase 6: inject MQTT credentials when EMQX anonymous auth is disabled
                if (cfg.mqttUsername != null) {
                    opts.setUserName(cfg.mqttUsername);
                    opts.setPassword(cfg.mqttPassword != null ? cfg.mqttPassword.toCharArray() : new char[0]);
                }

                // NDEATH as Last-Will
                SparkplugBPayload deathPayload = new SparkplugBPayload.SparkplugBPayloadBuilder(0L)
                        .setTimestamp(new Date())
                        .addMetric(new Metric.MetricBuilder("bdSeq", MetricDataType.Int64,
                                bdSeq.get()).createMetric())
                        .createPayload();
                byte[] deathBytes = new SparkplugBPayloadEncoder().getBytes(deathPayload, false);
                opts.setWill(topicNDeath, deathBytes, MQTT_QOS, false);

                mqttClient.connect(opts);
                LOG.info("MQTT connected on attempt {}", attempt);
                return;
            } catch (Exception e) {
                LOG.warn("MQTT connect attempt {} failed: {}", attempt, e.getMessage());
                try { Thread.sleep(3000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }
        throw new RuntimeException("Could not connect to MQTT broker after 20 attempts");
    }

    private void publishMqtt(String topic, byte[] payload, boolean retained) throws MqttException {
        if (mqttClient == null || !mqttClient.isConnected()) {
            LOG.warn("MQTT not connected — dropping message to {}", topic);
            return;
        }
        MqttMessage msg = new MqttMessage(payload);
        msg.setQos(MQTT_QOS);
        msg.setRetained(retained);
        mqttClient.publish(topic, msg);
    }

    // ── JSON helpers ───────────────────────────────────────────────────────

    private static String text(JsonNode n, String f) {
        JsonNode v = n.get(f); return (v == null || v.isNull()) ? "" : v.asText();
    }
    private static int intVal(JsonNode n, String f, int def) {
        JsonNode v = n.get(f); return (v == null || v.isNull()) ? def : v.asInt(def);
    }
    private static boolean boolVal(JsonNode n, String f) {
        JsonNode v = n.get(f); return v != null && !v.isNull() && v.asBoolean();
    }

    private static MetricDataType dataType(String name) {
        switch (name) {
            case "severity":       return MetricDataType.Int32;
            case "acknowledged":
            case "conditionActive":return MetricDataType.Boolean;
            default:               return MetricDataType.String;
        }
    }

    private static Object seedValue(JsonNode n, String name) {
        switch (name) {
            case "severity":       return (long) intVal(n, "severity", 0);
            case "acknowledged":   return boolVal(n, "acknowledged");
            case "conditionActive":return boolVal(n, "conditionActive");
            default:               return text(n, name);
        }
    }
}
