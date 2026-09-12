package com.ams.flink.cplm;

import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;

/**
 * Live-plane report-by-exception (RBE) job — feeds the Sparkplug route.
 *
 * <p>Consumes canonical loop samples and emits one compact delta per changed
 * {@code (loopId, metric)} pair to the {@code traverse.cpa.live.loop.metrics} topic, which the
 * sparkplug-edge-node bridges to Sparkplug B DDATA on EMQX and mirrors into
 * Redis snapshot keys.
 *
 * <p>Emission rules:
 * <ul>
 *   <li>Numeric metrics (pv, sp, op, vp) emit when {@code |new - last| > deadband},
 *       so a steady loop produces no traffic.</li>
 *   <li>String metrics (mode, quality) emit on any change.</li>
 *   <li>The first observation of a key always emits, so a restarted edge node
 *       repopulates snapshots without a rebirth request.</li>
 * </ul>
 *
 * <p>Output shape (see cpa-docs/01-target-architecture.md §6.3):
 * <pre>{@code
 * {"loopId":"FIC10409","metric":"pv","ts":1754300000000,
 *  "value":42.1,"quality":"GOOD","dataType":"double"}
 * }</pre>
 *
 * <p>State pattern (keyed ValueState compare-then-emit) is carried over from the
 * retired alarm-side {@code AlarmStateExportJob}, which used it to derive
 * INSERT/UPDATE/REMOVE deltas from a compacted state topic.
 *
 * <p><b>Phase 0 status:</b> compiles and runs, but is intentionally NOT yet added
 * to {@code infra/docker/flink-job-supervisor.sh}. It is activated in Phase 3
 * alongside EMQX, Redis and the sparkplug-edge-node service. KPI metrics sourced
 * from {@code traverse.cpa.clpm.gate.results.v1} (confidence, diagnosis, OCE) are also wired
 * in Phase 3 — this stage covers the raw signal metrics only.
 *
 * <p>Args: {@code --bootstrap.servers}, {@code --input-topic} (default
 * {@code traverse.cpa.loop.samples.v1}), {@code --live-topic} (default {@code traverse.cpa.live.loop.metrics}),
 * {@code --deadband} (absolute EU, default 0.05), {@code --consumer-group-id}.
 */
public final class LoopLiveRbeJob {

    static final String DEFAULT_LIVE_TOPIC = "traverse.cpa.live.loop.metrics";
    static final String DEFAULT_INPUT_TOPIC = "traverse.cpa.loop.samples.v1";
    static final double DEFAULT_DEADBAND = 0.05;
    /**
     * Re-publish every known signal this often even when it has not moved.
     *
     * <p>Report-by-exception alone cannot keep a live plane populated: a setpoint
     * that holds for a month is emitted once and never again, so the downstream
     * snapshot (written with a TTL) expires and the HMI shows nothing for a value
     * that is perfectly well known. Republishing the source does not help either —
     * the filter below compares against its own last emitted value and suppresses
     * the unchanged repeat.
     *
     * <p>The heartbeat stays comfortably under the snapshot TTL (REDIS_TTL_SECS,
     * 3600 s) so a key is refreshed many times before it could expire.
     *
     * <p>IMPORTANT — a key does NOT lapse when the source dies. The timer
     * reschedules for as long as the job runs, so the snapshot is kept alive
     * whether or not anything is still publishing. That is deliberate: for a
     * setpoint or a mode, silence means "unchanged", and expiring the key would
     * throw away a value that is perfectly well known.
     *
     * <p>Staleness is therefore signalled by the TIMESTAMP, not by absence.
     * {@code lastPoint} is refreshed on every message received, so a live loop's
     * heartbeat carries a near-current ts while a dead one's freezes and visibly
     * ages. Consumers MUST read that ts — with heartbeats running, "no live
     * value" no longer means "no publisher", and a UI that shows the value
     * without its age will present a dead feed as current.
     */
    static final long DEFAULT_HEARTBEAT_SECONDS = 300;

    private LoopLiveRbeJob() {
    }

    public static void main(String[] args) throws Exception {
        CplmJobConfig base = CplmJobConfig.fromArgs(args);
        String inputTopic = argOr(args, "input-topic", DEFAULT_INPUT_TOPIC);
        String liveTopic = argOr(args, "live-topic", DEFAULT_LIVE_TOPIC);
        double deadband = parseDouble(argOr(args, "deadband", String.valueOf(DEFAULT_DEADBAND)), DEFAULT_DEADBAND);
        long heartbeatSec = (long) parseDouble(
                argOr(args, "heartbeat-seconds", String.valueOf(DEFAULT_HEARTBEAT_SECONDS)),
                DEFAULT_HEARTBEAT_SECONDS);
        String groupId = argOr(args, "consumer-group-id", "traverse-cpa-flink-cplm") + "-live-rbe";

        CplmJobConfig cfg = new CplmJobConfig(base.brokers, "AMS - Loop Live RBE Engine",
                groupId, inputTopic, liveTopic,
                base.shortFeatureTopic, base.longFeatureTopic,
                base.windowHours, base.outOfOrdernessMinutes);

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(60_000, CheckpointingMode.EXACTLY_ONCE);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(inputTopic)
                .setGroupId(groupId)
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<String> raw = env.fromSource(source, WatermarkStrategy.noWatermarks(), "live-rbe-source");

        DataStream<MetricPoint> exploded = raw
                .process(new ExplodeToMetrics())
                .name("live-rbe-explode")
                .uid("live-rbe-explode");

        DataStream<String> deltas = exploded
                .keyBy(p -> p.loopId + "\0" + p.metric)
                .process(new RbeFilter(deadband, heartbeatSec))
                .name("live-rbe-filter")
                .uid("live-rbe-filter");

        // Keyed by loopId (PIPE-010): per-loop ordering across traverse.cpa.live.loop.metrics partitions.
        CplmKafkaSink.attachKeyed(deltas, cfg, liveTopic, "live-metrics-sink", "loopId");

        env.execute(cfg.jobName);
    }

    /** One value of one metric at one instant. */
    public static class MetricPoint {
        public String loopId;
        public String metric;
        public long ts;
        public double numeric;
        public String text;
        public boolean isNumeric;
        public String quality;

        public MetricPoint() {
        }

        static MetricPoint num(String loopId, String metric, long ts, double v, String quality) {
            MetricPoint p = new MetricPoint();
            p.loopId = loopId;
            p.metric = metric;
            p.ts = ts;
            p.numeric = v;
            p.isNumeric = true;
            p.quality = quality;
            return p;
        }

        static MetricPoint str(String loopId, String metric, long ts, String v, String quality) {
            MetricPoint p = new MetricPoint();
            p.loopId = loopId;
            p.metric = metric;
            p.ts = ts;
            p.text = v;
            p.isNumeric = false;
            p.quality = quality;
            return p;
        }
    }

    /** Fans one canonical sample out into its constituent metrics. */
    public static class ExplodeToMetrics extends ProcessFunction<String, MetricPoint> {
        @Override
        public void processElement(String json, Context ctx, Collector<MetricPoint> out) {
            CplmNormalizedSample s = CplmNormalizedSample.fromJson(json);
            if (s == null || s.loopId == null || !s.isValid) {
                return;
            }
            String q = s.quality == null ? "GOOD" : s.quality;
            out.collect(MetricPoint.num(s.loopId, "pv", s.eventTsMs, s.pv, q));
            out.collect(MetricPoint.num(s.loopId, "sp", s.eventTsMs, s.sp, q));
            out.collect(MetricPoint.num(s.loopId, "op", s.eventTsMs, s.op, q));
            if (s.vp != null) {
                out.collect(MetricPoint.num(s.loopId, "vp", s.eventTsMs, s.vp, q));
            }
            out.collect(MetricPoint.str(s.loopId, "mode", s.eventTsMs, s.mode, q));
            out.collect(MetricPoint.str(s.loopId, "quality", s.eventTsMs, q, q));
        }
    }

    /**
     * Emits only when a metric moves beyond the deadband (numeric) or changes at
     * all (text). Mirrors AlarmStateExportJob.StateDeltaFunction's keyed
     * compare-then-emit, specialised to scalar process values.
     */
    public static class RbeFilter extends KeyedProcessFunction<String, MetricPoint, String> {
        private final double deadband;
        private final long heartbeatMs;
        private transient ValueState<String> lastEmitted;
        // The whole point carried forward, so the heartbeat can republish a
        // faithful copy (metric name, quality, numeric-vs-text) rather than a
        // reconstruction that guesses the type.
        private transient ValueState<MetricPoint> lastPoint;
        private transient ValueState<Long> timerAt;
        private transient ObjectMapper mapper;

        public RbeFilter(double deadband) {
            this(deadband, DEFAULT_HEARTBEAT_SECONDS);
        }

        public RbeFilter(double deadband, long heartbeatSeconds) {
            this.deadband = deadband;
            this.heartbeatMs = Math.max(0L, heartbeatSeconds) * 1000L;
        }

        @Override
        public void open(Configuration parameters) {
            lastEmitted = getRuntimeContext().getState(
                    new ValueStateDescriptor<>("lastEmittedValue", String.class));
            lastPoint = getRuntimeContext().getState(
                    new ValueStateDescriptor<>("lastPoint", MetricPoint.class));
            timerAt = getRuntimeContext().getState(
                    new ValueStateDescriptor<>("heartbeatTimerAt", Long.class));
            mapper = new ObjectMapper();
        }

        /** Keeps exactly one heartbeat timer per key, rolled forward on each emit. */
        private void scheduleHeartbeat(Context ctx) throws Exception {
            if (heartbeatMs <= 0) return;
            Long prev = timerAt.value();
            if (prev != null) ctx.timerService().deleteProcessingTimeTimer(prev);
            long next = ctx.timerService().currentProcessingTime() + heartbeatMs;
            ctx.timerService().registerProcessingTimeTimer(next);
            timerAt.update(next);
        }

        /**
         * Republishes the last known value so the downstream snapshot is refreshed
         * before its TTL runs out. The payload is byte-identical to the original
         * emit apart from a {@code heartbeat} marker, and it deliberately carries
         * the ORIGINAL sample timestamp — inventing a fresh one would make a
         * month-old setpoint look like it had just been measured.
         */
        @Override
        public void onTimer(long ts, OnTimerContext ctx, Collector<String> out) throws Exception {
            MetricPoint p = lastPoint.value();
            if (p == null) return;
            out.collect(render(p, true));
            scheduleHeartbeat(ctx);
        }

        @Override
        public void processElement(MetricPoint p, Context ctx, Collector<String> out) throws Exception {
            String prev = lastEmitted.value();
            String current = p.isNumeric ? Double.toString(p.numeric) : String.valueOf(p.text);

            boolean emit;
            if (prev == null) {
                emit = true;
            } else if (p.isNumeric) {
                double prevVal;
                try {
                    prevVal = Double.parseDouble(prev);
                } catch (NumberFormatException e) {
                    prevVal = Double.NaN;
                }
                emit = Double.isNaN(prevVal) || Math.abs(p.numeric - prevVal) > deadband;
            } else {
                emit = !prev.equals(current);
            }

            // Remember the point even when the value is unchanged: the heartbeat
            // republishes the CURRENT quality and timestamp, not the stale ones
            // from whenever the value last moved.
            lastPoint.update(p);

            if (!emit) {
                return;
            }

            lastEmitted.update(current);
            out.collect(render(p, false));
            scheduleHeartbeat(ctx);
        }

        private String render(MetricPoint p, boolean heartbeat) throws Exception {
            ObjectNode node = mapper.createObjectNode();
            node.put("loopId", p.loopId);
            node.put("metric", p.metric);
            node.put("ts", p.ts);
            if (p.isNumeric) {
                node.put("value", p.numeric);
                node.put("dataType", "double");
            } else {
                node.put("value", p.text);
                node.put("dataType", "string");
            }
            node.put("quality", p.quality);
            // Consumers that only care about real movement can drop these; the
            // snapshot writer wants them, which is the point.
            if (heartbeat) node.put("heartbeat", true);
            return mapper.writeValueAsString(node);
        }
    }

    private static String argOr(String[] args, String key, String def) {
        for (int i = 0; i < args.length - 1; i++) {
            String a = args[i].startsWith("--") ? args[i].substring(2) : args[i];
            if (a.equals(key)) {
                return args[i + 1];
            }
        }
        return def;
    }

    private static double parseDouble(String raw, double def) {
        try {
            return Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            return def;
        }
    }

    /** Kept for symmetry with other jobs that inspect raw JSON directly. */
    static String textField(JsonNode node, String field, String def) {
        JsonNode v = node == null ? null : node.get(field);
        return v == null || v.isNull() ? def : v.asText(def);
    }
}
