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

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
 *
 * Threading note: MQTT callbacks run on Paho's internal thread. We must NOT
 * do blocking publish operations inside callbacks or it deadlocks the client.
 * Instead, we signal the main thread to publish NBIRTH after connect.
 */
public class AlarmMetricPublisher implements MqttCallbackExtended {

    private static final Logger LOG = LoggerFactory.getLogger(AlarmMetricPublisher.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MQTT_QOS = 0;

    private final SparkplugConfig      cfg;
    private final MetricAliasRegistry  aliases;
    private final JedisPool            jedisPool;

    // IoTDB REST v2 (history persistence for process values). Best-effort, like Redis.
    private final HttpClient           httpClient  = HttpClient.newHttpClient();
    private final String               iotdbUrl    = envOr("IOTDB_REST_URL", "http://iotdb:8181");
    private final boolean              iotdbEnabled= !"false".equalsIgnoreCase(System.getenv("IOTDB_PERSIST"));
    private final String               iotdbAuth   = Base64.getEncoder().encodeToString(
        (envOr("IOTDB_USER", "root") + ":" + envOr("IOTDB_PASSWORD", "root")).getBytes(StandardCharsets.UTF_8));
    private final Set<String>          bornDevices = Collections.synchronizedSet(new HashSet<>());
    private final AtomicLong           bdSeq       = new AtomicLong(0);
    private final AtomicLong           seq         = new AtomicLong(0);

    // Signal from callback thread to main thread that NBIRTH needs publishing
    private final AtomicBoolean        needsNBirth = new AtomicBoolean(false);
    private volatile CountDownLatch    connectLatch;

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

        // Publish NBIRTH from main thread (not callback thread) to avoid Paho deadlock
        publishNBirthIfNeeded();

        Properties kProps = new Properties();
        kProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG,  cfg.kafkaBrokers);
        kProps.put(ConsumerConfig.GROUP_ID_CONFIG,           cfg.kafkaGroupId);
        kProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG,  cfg.kafkaAutoOffsetReset);
        kProps.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");
        kProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,
                "org.apache.kafka.common.serialization.StringDeserializer");
        kProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,
                "org.apache.kafka.common.serialization.StringDeserializer");
        kProps.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "500");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(kProps)) {
            consumer.subscribe(List.of(cfg.liveAlarmsTopic, cfg.liveMetricsTopic, cfg.liveLoopMetricsTopic));
            LOG.info("Kafka consumer subscribed to {} / {} / {}",
                    cfg.liveAlarmsTopic, cfg.liveMetricsTopic, cfg.liveLoopMetricsTopic);

            while (running) {
                // Check for reconnect - may need to re-publish NBIRTH
                publishNBirthIfNeeded();

                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
                if (!records.isEmpty()) {
                    LOG.info("Polled {} record(s) from Kafka", records.count());
                }
                for (ConsumerRecord<String, String> rec : records) {
                    try {
                        LOG.debug("Processing record: topic={} key={} len={}",
                                rec.topic(), rec.key(), rec.value() != null ? rec.value().length() : 0);
                        if (rec.topic().equals(cfg.liveLoopMetricsTopic)) {
                            processLoopMetricRecord(rec); // CPLM loop signals (pv/sp/op/vp/mode)
                        } else if (rec.topic().equals(cfg.liveMetricsTopic)) {
                            processMetricRecord(rec);   // generic process values (level/speed/position/…)
                        } else {
                            processRecord(rec);         // alarm records (legacy schema)
                        }
                    } catch (Exception e) {
                        LOG.warn("Failed to process record from {}: {}", rec.topic(), e.getMessage(), e);
                    }
                }
            }
        }
    }

    /** Publishes NBIRTH if signaled by connectComplete callback. */
    private void publishNBirthIfNeeded() {
        if (needsNBirth.compareAndSet(true, false)) {
            try {
                publishNBirth();
            } catch (Exception e) {
                LOG.error("Failed to publish NBIRTH: {}", e.getMessage(), e);
                // Don't retry immediately - will be retried on next reconnect or poll cycle
            }
        }
    }

    // ── MQTT callbacks ─────────────────────────────────────────────────────

    @Override
    public void connectComplete(boolean reconnect, String serverURI) {
        LOG.info("MQTT {} to {}", reconnect ? "reconnected" : "connected", serverURI);
        // Reset state for new session
        seq.set(0);
        bornDevices.clear();
        aliases.reset();
        // Signal main thread to publish NBIRTH (don't publish from callback thread - it deadlocks Paho)
        needsNBirth.set(true);
        if (connectLatch != null) {
            connectLatch.countDown();
        }
        LOG.debug("Signaled main thread to publish NBIRTH");
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
        if (rec.value() == null || rec.value().isBlank()) {
            LOG.debug("Skipping empty record");
            return;
        }

        JsonNode node = MAPPER.readTree(rec.value());
        String alarmId = text(node, "alarmId");
        if (alarmId.isEmpty()) {
            LOG.warn("Skipping record with empty alarmId: {}", rec.value().substring(0, Math.min(100, rec.value().length())));
            return;
        }

        // Device = sanitised source name (or fallback to alarmId prefix)
        String source  = text(node, "sourceName");
        String deviceId = source.isEmpty()
                ? "alarm_" + alarmId.replace("-", "").substring(0, Math.min(8, alarmId.length()))
                : source.replaceAll("[^a-zA-Z0-9_\\-]", "_");

        LOG.info("Processing alarm {} -> device '{}'", alarmId, deviceId);

        // Ensure DBIRTH was published for this device
        if (!bornDevices.contains(deviceId)) {
            LOG.info("Publishing DBIRTH for new device '{}'", deviceId);
            publishDBirth(deviceId, node);
            bornDevices.add(deviceId);
        }

        // Build DDATA payload (alias-only per Sparkplug spec)
        LOG.debug("Publishing DDATA for device '{}' alarmId={}", deviceId, alarmId);
        publishDData(deviceId, node);
        writeToRedis(deviceId, node);
        LOG.info("Successfully processed alarm {} for device '{}'", alarmId, deviceId);
    }

    // ── Generic process-metric branch (live.metrics) ───────────────────────
    // Forwards arbitrary process values (level/speed/position/…) as Sparkplug
    // DDATA with the metric NAME included (receivers key by device/name, no alias
    // needed) and writes a Redis snapshot. group/edge are taken PER RECORD so a
    // single edge node serves many sites (houston, dallas, …).
    // Record shape: {group,edge,device,metric,value,quality?,ts?,type?}

    private void processMetricRecord(ConsumerRecord<String, String> rec) throws Exception {
        if (rec.value() == null || rec.value().isBlank()) return;

        JsonNode node = MAPPER.readTree(rec.value());
        String device = text(node, "device");
        String metric = text(node, "metric");
        if (device.isEmpty() || metric.isEmpty()) {
            LOG.warn("Skipping metric record missing device/metric: {}",
                    rec.value().substring(0, Math.min(120, rec.value().length())));
            return;
        }

        String group = node.hasNonNull("group") ? node.get("group").asText() : cfg.sparkplugGroup;
        String edge  = node.hasNonNull("edge")  ? node.get("edge").asText()  : cfg.sparkplugEdge;
        long   ts    = node.hasNonNull("ts")      ? node.get("ts").asLong()      : System.currentTimeMillis();
        int    quality = node.hasNonNull("quality") ? node.get("quality").asInt() : 192;

        JsonNode v  = node.get("value");
        String type = text(node, "type").toLowerCase();
        Object value;
        MetricDataType dtype;
        if (type.equals("bool")   || (type.isEmpty() && v != null && v.isBoolean())) {
            value = (v != null && v.asBoolean()); dtype = MetricDataType.Boolean;
        } else if (type.equals("string") || (type.isEmpty() && v != null && v.isTextual())) {
            value = (v != null ? v.asText() : ""); dtype = MetricDataType.String;
        } else if (type.equals("int") || (type.isEmpty() && v != null && v.isIntegralNumber())) {
            value = (v != null ? v.asInt() : 0); dtype = MetricDataType.Int32;
        } else {
            value = (v != null ? v.asDouble() : 0.0); dtype = MetricDataType.Double;
        }

        // A device must be born before its data means anything. Only the alarm
        // branch used to do this, so every process-value device emitted DDATA
        // with no birth certificate — spec-invalid, and consumers that track
        // birth/death saw metrics from a device they had never been told about.
        ensureProcessDeviceBorn(group, edge, device, metric, dtype, value, ts);
        publishMetricDData(group, edge, device, metric, dtype, value, ts, quality);
        writeMetricSnapshot(group, edge, device, metric, value, quality, ts);

        // History: persist numeric process values to IoTDB at root.<site>.<unit>.<device>.<measurement>
        String path = text(node, "path");
        if (iotdbEnabled && !path.isEmpty()
                && (dtype == MetricDataType.Double || dtype == MetricDataType.Int32)) {
            writeToIoTDB(path, value, ts);
        }
        LOG.info("Metric {}/{}={} → spBv1.0/{}/DDATA/{}/{}", device, metric, value, group, edge, device);
    }

    // ── CPLM loop-metric branch (live.loop.metrics, Phase 6.2) ────────────
    // LoopLiveRbeJob emits one report-by-exception record per changed signal:
    //   {loopId, metric, value, dataType, quality, ts}
    // The loop becomes the Sparkplug device and pv/sp/op/vp/mode its metrics, so
    // a faceplate subscribes to one device and gets the whole loop.

    private void processLoopMetricRecord(ConsumerRecord<String, String> rec) throws Exception {
        if (rec.value() == null || rec.value().isBlank()) return;

        JsonNode node = MAPPER.readTree(rec.value());
        String loopId = text(node, "loopId");
        String metric = text(node, "metric");
        if (loopId.isEmpty() || metric.isEmpty()) {
            LOG.warn("Skipping loop metric missing loopId/metric: {}",
                    rec.value().substring(0, Math.min(120, rec.value().length())));
            return;
        }

        String device = loopId.replaceAll("[^a-zA-Z0-9_\\-]", "_");
        String group  = cfg.sparkplugGroup;
        String edge   = cfg.sparkplugEdge;
        long   ts     = node.hasNonNull("ts") ? node.get("ts").asLong() : System.currentTimeMillis();

        // CPLM quality is a NAMUR/OPC string ("GOOD"/"BAD"/…); Sparkplug carries
        // the OPC numeric. Map rather than defaulting, so a bad sensor does not
        // arrive on the HMI looking healthy.
        int quality = 192;
        JsonNode q = node.get("quality");
        if (q != null && q.isNumber()) {
            quality = q.asInt();
        } else if (q != null && q.isTextual()) {
            String qs = q.asText().toUpperCase();
            quality = qs.startsWith("GOOD") ? 192 : qs.startsWith("UNCERTAIN") ? 64 : 0;
        }

        JsonNode v = node.get("value");
        String dataType = text(node, "dataType").toLowerCase();
        Object value;
        MetricDataType dtype;
        if (dataType.equals("string") || (dataType.isEmpty() && v != null && v.isTextual())) {
            value = (v != null ? v.asText() : ""); dtype = MetricDataType.String;
        } else {
            value = (v != null ? v.asDouble() : 0.0); dtype = MetricDataType.Double;
        }

        ensureProcessDeviceBorn(group, edge, device, metric, dtype, value, ts);
        publishMetricDData(group, edge, device, metric, dtype, value, ts, quality);
        writeMetricSnapshot(group, edge, device, metric, value, quality, ts);
        LOG.debug("Loop {}/{}={} q={} -> spBv1.0/{}/DDATA/{}/{}",
                device, metric, value, quality, group, edge, device);
    }

    /**
     * Publishes DBIRTH once per process-value device. Sparkplug requires a birth
     * before data; the alarm branch did this but the metric branch never did, so
     * process devices streamed DDATA no consumer had been introduced to.
     */
    private void ensureProcessDeviceBorn(String group, String edge, String device, String metric,
                                         MetricDataType dtype, Object value, long ts) throws Exception {
        String key = group + "/" + edge + "/" + device;
        if (bornDevices.contains(key)) return;

        String topic = "spBv1.0/" + group + "/DBIRTH/" + edge + "/" + device;
        SparkplugBPayload payload = new SparkplugBPayload.SparkplugBPayloadBuilder(seq.getAndIncrement())
                .setTimestamp(new Date(ts))
                .addMetric(new Metric.MetricBuilder(metric, dtype, value).createMetric())
                .createPayload();
        publishMqtt(topic, new SparkplugBPayloadEncoder().getBytes(payload, false), false);
        bornDevices.add(key);
        LOG.info("Published DBIRTH for process device '{}' ({})", device, topic);
    }

    /** Best-effort async insert of a numeric sample into IoTDB via REST v2. */
    private void writeToIoTDB(String path, Object value, long ts) {
        try {
            int dot = path.lastIndexOf('.');
            if (dot < 0) return;
            String devicePath  = "root." + path.substring(0, dot).replace('/', '.');
            String measurement = path.substring(dot + 1);
            String sql = "INSERT INTO " + devicePath + "(timestamp," + measurement + ") VALUES("
                    + ts + "," + value + ")";
            String body = "{\"sql\":" + valueJson(sql) + "}";
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(iotdbUrl + "/rest/v2/nonQuery"))
                    .header("Authorization", "Basic " + iotdbAuth)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            httpClient.sendAsync(req, HttpResponse.BodyHandlers.discarding());
        } catch (Exception e) {
            LOG.debug("IoTDB write failed (non-fatal): {}", e.getMessage());
        }
    }

    private static String envOr(String key, String def) {
        String v = System.getenv(key);
        return (v != null && !v.isBlank()) ? v : def;
    }

    private void publishMetricDData(String group, String edge, String device, String metric,
                                    MetricDataType dtype, Object value, long ts) throws Exception {
        publishMetricDData(group, edge, device, metric, dtype, value, ts, 192);
    }

    /**
     * Publishes DDATA with quality attached as a Sparkplug metric PROPERTY.
     * The HMI reads {@code m.properties?.quality?.value}; because nothing ever
     * set it, every value rendered as quality 192 (GOOD) regardless of what the
     * source actually reported — a bad sensor looked healthy on the faceplate.
     */
    private void publishMetricDData(String group, String edge, String device, String metric,
                                    MetricDataType dtype, Object value, long ts, int quality) throws Exception {
        String topic = "spBv1.0/" + group + "/DDATA/" + edge + "/" + device;
        SparkplugBPayload payload = new SparkplugBPayload.SparkplugBPayloadBuilder(seq.getAndIncrement())
                .setTimestamp(new Date(ts))
                .addMetric(new Metric.MetricBuilder(metric, dtype, value)
                        .properties(new PropertySet.PropertySetBuilder()
                                .addProperty("quality",
                                        new PropertyValue(PropertyDataType.Int32, quality))
                                .createPropertySet())
                        .createMetric())
                .createPayload();
        byte[] encoded = new SparkplugBPayloadEncoder().getBytes(payload, false);
        publishMqtt(topic, encoded, false);
    }

    private void writeMetricSnapshot(String group, String edge, String device, String metric,
                                     Object value, int quality, long ts) {
        String key = "snapshot:metric:" + group + ":" + edge + ":" + device + ":" + metric;
        String json = "{\"v\":" + valueJson(value) + ",\"q\":" + quality + ",\"ts\":" + ts + "}";
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.setex(key, cfg.redisTtlSeconds, json);
        } catch (Exception e) {
            LOG.debug("Redis metric snapshot write failed (non-fatal): {}", e.getMessage());
        }
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
        for (String metricName : List.of("alarmId", "severity", "state", "acknowledged",
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
        LOG.info("Published DBIRTH for device '{}' ({} bytes)", deviceId, encoded.length);
    }

    private void publishDData(String deviceId, JsonNode node) throws Exception {
        String topic = "spBv1.0/" + cfg.sparkplugGroup + "/DDATA/" + cfg.sparkplugEdge + "/" + deviceId;
        SparkplugBPayload.SparkplugBPayloadBuilder builder =
                new SparkplugBPayload.SparkplugBPayloadBuilder(seq.getAndIncrement())
                        .setTimestamp(new Date(node.has("rbeTs") ? node.get("rbeTs").asLong() : System.currentTimeMillis()));

        // DDATA: alias only (no name) — receiver resolves via DBIRTH alias map
        // Note: Int32 expects Integer, Int64 expects Long — Sparkplug encoder is strict about types
        addAliasMetric(builder, "alarmId",          MetricDataType.String,  text(node, "alarmId"));
        addAliasMetric(builder, "severity",       MetricDataType.Int32,   intVal(node, "severity", 0));
        addAliasMetric(builder, "state",          MetricDataType.String,  text(node, "state"));
        addAliasMetric(builder, "acknowledged",   MetricDataType.Boolean, boolVal(node, "acknowledged"));
        addAliasMetric(builder, "conditionActive",MetricDataType.Boolean, boolVal(node, "conditionActive"));
        addAliasMetric(builder, "priority",       MetricDataType.String,  text(node, "priority"));
        addAliasMetric(builder, "sourceName",     MetricDataType.String,  text(node, "sourceName"));
        addAliasMetric(builder, "conditionName",  MetricDataType.String,  text(node, "conditionName"));
        addAliasMetric(builder, "message",        MetricDataType.String,  text(node, "message"));

        byte[] encoded = new SparkplugBPayloadEncoder().getBytes(builder.createPayload(), false);
        publishMqtt(topic, encoded, false);
        LOG.info("Published DDATA for device '{}' ({} bytes)", deviceId, encoded.length);
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
            writeSnapshotField(pipe, prefix + "alarmId",          text(node, "alarmId"),             ts);
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
                // Prepare latch for connect callback
                connectLatch = new CountDownLatch(1);
                needsNBirth.set(false);
                
                mqttClient = new MqttClient(cfg.mqttBrokerUri(), cfg.mqttClientId,
                        new MemoryPersistence());
                mqttClient.setCallback(this);

                MqttConnectOptions opts = new MqttConnectOptions();
                opts.setCleanSession(true);
                opts.setKeepAliveInterval(30);
                opts.setConnectionTimeout(10);
                opts.setAutomaticReconnect(true);
                // Increase max in-flight messages to avoid blocking
                opts.setMaxInflight(50);
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
                
                // Wait for connectComplete callback to signal it's ready
                if (!connectLatch.await(5, TimeUnit.SECONDS)) {
                    LOG.warn("Connect callback did not complete in 5 seconds");
                }
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
        
        LOG.debug("Publishing {} bytes to {} (retained={})", payload.length, topic, retained);
        
        // Synchronous publish - safe when called from main thread (not from callback)
        // The main thread was changed to call NBIRTH, not the callback, to avoid deadlock
        MqttMessage msg = new MqttMessage(payload);
        msg.setQos(MQTT_QOS);
        msg.setRetained(retained);
        
        try {
            mqttClient.publish(topic, msg);
        } catch (MqttException e) {
            LOG.error("MQTT publish failed for {}: {} (reason: {})", 
                    topic, e.getMessage(), e.getReasonCode(), e);
            throw e;
        }
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
            case "severity":       return intVal(n, "severity", 0);  // Int32 expects Integer, not Long
            case "acknowledged":   return boolVal(n, "acknowledged");
            case "conditionActive":return boolVal(n, "conditionActive");
            default:               return text(n, name);
        }
    }
}
