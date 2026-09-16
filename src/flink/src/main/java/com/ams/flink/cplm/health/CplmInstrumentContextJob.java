package com.ams.flink.cplm.health;

import com.ams.flink.cplm.CplmJobConfig;
import com.ams.flink.cplm.CplmKafkaSink;
import com.ams.flink.cplm.contract.CplmTopics;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.BasicTypeInfo;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.BroadcastStream;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.co.KeyedBroadcastProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.kafka.common.TopicPartition;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * v2.5 Task 1H.4 (spec v6 §4.5-4.6): {@code AMS - CPLM Instrument Context Engine}.
 *
 * <p>Consumes the gateway-validated Instrumental health records
 * (traverse.cpa.instrument.health.v1, keyed by device), keeps one {@link DeviceStateMachine} per
 * device, and publishes on traverse.cpa.context.instrument-health.v1 (compacted by context_key):
 * every device status interval (DEVICE_INTERVAL) and, for each loop signal bound to the device
 * as of the interval (bindings arrive on the metadata topic under {@code cplm.loop.binding}),
 * the signal's eligibility under the §4.6 policy (LOOP_CONTEXT). Source availability rides the
 * same control plane: OFFLINE closes the device intervals of that source. Freshness is a
 * processing-time timer per device. Absence of a binding is published as NOT_CONFIGURED.
 */
public final class CplmInstrumentContextJob {
    static final MapStateDescriptor<String, String> CONTROL_STATE =
            new MapStateDescriptor<>("cplm-health-control", BasicTypeInfo.STRING_TYPE_INFO, BasicTypeInfo.STRING_TYPE_INFO);

    private CplmInstrumentContextJob() {
    }

    public static void main(String[] args) throws Exception {
        CplmJobConfig base = CplmJobConfig.fromArgs(args);
        CplmJobConfig cfg = new CplmJobConfig(base.brokers, "AMS - CPLM Instrument Context Engine",
                base.consumerGroupId + "-health", base.inputTopic, base.outputTopic,
                base.shortFeatureTopic, base.longFeatureTopic, base.windowHours, base.outOfOrdernessMinutes);
        final String healthTopic = argOr(args, "--health-topic", CplmTopics.INSTRUMENT_HEALTH);
        final String contextTopic = argOr(args, "--context-topic", CplmTopics.INSTRUMENT_HEALTH_CONTEXT);
        final String metadataTopic = argOr(args, "--metadata-topic", CplmTopics.METADATA_UPDATES);
        final long siteMinFreshnessMs = Long.parseLong(argOr(args, "--site-min-freshness-s", "120")) * 1000L;
        final long timerMs = Long.parseLong(argOr(args, "--freshness-timer-s", "60")) * 1000L;

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(300_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(120_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        // The health ledger topic keeps 30 d: without a checkpoint the device machines are rebuilt from it.
        KafkaSource<String> health = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(healthTopic)
                .setGroupId(cfg.consumerGroupId)
                .setStartingOffsets(OffsetsInitializer.committedOffsets(org.apache.kafka.clients.consumer.OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
        DataStream<String> healthRaw = env.fromSource(health, WatermarkStrategy.noWatermarks(), "cplm-health-source")
                .name("cplm-health-source").uid("cplm-health-source");
        // Two identical method references (Objects::nonNull) in one job class deserialize into the
        // SAME lambda on the TaskManager ($deserializeLambda$ ignores the instantiated type), so the
        // bindings filter ran the HealthObservation-typed one -> ClassCastException. Distinct lambdas.
        DataStream<HealthObservation> observations = healthRaw
                .map(HealthObservation::fromJson)
                .filter(o -> o != null)
                .name("cplm-health-parse").uid("cplm-health-parse");

        // Control plane: loop bindings (compacted metadata topic) + source availability, broadcast to every device.
        KafkaSource<String> metadata = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics(metadataTopic)
                .setGroupId(cfg.consumerGroupId + "-bindings")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
        DataStream<String> bindings = env.fromSource(metadata, WatermarkStrategy.noWatermarks(), "cplm-health-bindings-source")
                .name("cplm-health-bindings-source").uid("cplm-health-bindings-source")
                .map(LoopBindings::fromMetadataEnvelope)
                .filter(lb -> lb != null)
                .map(lb -> "B" + lb.toJson())
                .name("cplm-health-bindings-parse").uid("cplm-health-bindings-parse");
        DataStream<String> availability = healthRaw
                .filter(s -> s.contains("\"SOURCE_AVAILABILITY\""))
                .map(s -> "A" + s)
                .name("cplm-health-availability").uid("cplm-health-availability");
        BroadcastStream<String> control = bindings.union(availability).broadcast(CONTROL_STATE);

        DataStream<String> contexts = observations
                .filter(o -> !o.isAvailability())
                .keyBy(HealthObservation::deviceKey)
                .connect(control)
                .process(new ContextFn(siteMinFreshnessMs, timerMs))
                .name("cplm-instrument-context").uid("cplm-instrument-context");

        CplmKafkaSink.attachKeyed(contexts, cfg, contextTopic, "cplm-instrument-context-sink", LoopHealthContext.KEY_FIELD);
        // v2.5 (3A.2): announce what this job can be configured with (readable property ids, catalogue hash,
        // compiled capacity) on the gate-config ACK topic at every start - capability from the RUNNING job
        com.ams.flink.cplm.config.CapabilityRecord.announce(env, cfg, cfg.jobName, args);
        env.execute(cfg.jobName);
    }

    private static String argOr(String[] args, String name, String def) {
        for (int i = 0; i + 1 < args.length; i++) if (name.equals(args[i])) return args[i + 1];
        return def;
    }

    /** One DeviceStateMachine per device; bindings and availability from the broadcast control plane. */
    static final class ContextFn extends KeyedBroadcastProcessFunction<String, HealthObservation, String, String> {
        private static final long serialVersionUID = 1L;
        private static final ObjectMapper MAPPER = new ObjectMapper();
        private final long siteMinFreshnessMs;
        private final long timerMs;
        private transient ValueState<DeviceStateMachine> machineState;
        private transient ValueState<String> sourceKeyState;
        private transient ValueState<Long> timerState;

        ContextFn(long siteMinFreshnessMs, long timerMs) {
            this.siteMinFreshnessMs = siteMinFreshnessMs;
            this.timerMs = timerMs;
        }

        @Override
        public void open(Configuration parameters) {
            machineState = getRuntimeContext().getState(new ValueStateDescriptor<>("cplm-device-machine", TypeInformation.of(DeviceStateMachine.class)));
            sourceKeyState = getRuntimeContext().getState(new ValueStateDescriptor<>("cplm-device-source", BasicTypeInfo.STRING_TYPE_INFO));
            timerState = getRuntimeContext().getState(new ValueStateDescriptor<>("cplm-device-timer", BasicTypeInfo.LONG_TYPE_INFO));
        }

        @Override
        public void processElement(HealthObservation o, ReadOnlyContext ctx, Collector<String> out) throws Exception {
            DeviceStateMachine m = machineState.value();
            if (m == null) m = new DeviceStateMachine(siteMinFreshnessMs);
            long now = ctx.timerService().currentProcessingTime();
            List<DeviceStateMachine.Transition> transitions = m.apply(o, now);
            machineState.update(m);
            sourceKeyState.update(o.tenantId + "|" + o.site + "|" + o.sourceId);
            emit(transitions, ctx.getBroadcastState(CONTROL_STATE).immutableEntries(), now, out);
            if (timerState.value() == null) {
                long t = now + timerMs;
                ctx.timerService().registerProcessingTimeTimer(t);
                timerState.update(t);
            }
        }

        @Override
        public void onTimer(long timestamp, OnTimerContext ctx, Collector<String> out) throws Exception {
            DeviceStateMachine m = machineState.value();
            if (m != null) {
                List<DeviceStateMachine.Transition> transitions = m.onTimer(timestamp);
                if (!transitions.isEmpty()) {
                    machineState.update(m);
                    emit(transitions, ctx.getBroadcastState(CONTROL_STATE).immutableEntries(), timestamp, out);
                }
            }
            long t = timestamp + timerMs;
            ctx.timerService().registerProcessingTimeTimer(t);
            timerState.update(t);
        }

        @Override
        public void processBroadcastElement(String value, Context ctx, Collector<String> out) throws Exception {
            if (value.isEmpty()) return;
            char tag = value.charAt(0);
            String json = value.substring(1);
            long now = ctx.currentProcessingTime();
            if (tag == 'B') {
                LoopBindings lb = LoopBindings.fromStateJson(json);
                if (lb == null || lb.loopId.isEmpty()) return;
                ctx.getBroadcastState(CONTROL_STATE).put("binding:" + lb.loopId, json);
                if (lb.bindings.isEmpty()) {
                    out.collect(LoopHealthContext.notConfigured(MAPPER, lb.loopId, "PV", now));
                    return;
                }
                // Re-publish the contexts of every device this loop is bound to, from their current intervals.
                final List<String> records = new ArrayList<>();
                ctx.applyToKeyedState(new ValueStateDescriptor<>("cplm-device-machine", TypeInformation.of(DeviceStateMachine.class)),
                        (key, state) -> {
                            DeviceStateMachine m = state.value();
                            if (m == null || m.current() == null) return;
                            HealthInterval cur = m.current();
                            for (LoopBindings.Binding b : lb.bindingsForDevice(cur.deviceId, cur.toMs == null ? now : cur.toMs - 1)) {
                                records.add(LoopHealthContext.loopContext(MAPPER, lb.loopId, b.signalRole, b.bindingId, cur,
                                        HealthEligibilityPolicy.evaluate(cur, lb.loopId + "." + b.signalRole), "BINDING", now));
                            }
                        });
                for (String r : records) out.collect(r);
            } else if (tag == 'A') {
                HealthObservation av = HealthObservation.fromJson(json);
                if (av == null || !av.isAvailability()) return;
                String sourceKey = av.tenantId + "|" + av.site + "|" + av.sourceId;
                ctx.getBroadcastState(CONTROL_STATE).put("availability:" + sourceKey, av.availabilityState + "@" + av.sinceMs);
                if (!"OFFLINE".equals(av.availabilityState)) return;
                final long at = av.sinceMs > 0 ? av.sinceMs : now;
                final List<String> records = new ArrayList<>();
                final Iterable<Map.Entry<String, String>> control = ctx.getBroadcastState(CONTROL_STATE).immutableEntries();
                ctx.applyToKeyedState(new ValueStateDescriptor<>("cplm-device-machine", TypeInformation.of(DeviceStateMachine.class)),
                        (key, state) -> {
                            DeviceStateMachine m = state.value();
                            if (m == null || m.current() == null) return;
                            // the device belongs to this source when its key carries the same tenant|site prefix
                            // and its intervals came from that source (sourceKeyState is keyed; compare by prefix here)
                            if (!key.startsWith(av.tenantId + "|" + av.site + "|")) return;
                            List<DeviceStateMachine.Transition> t = m.sourceOffline(at);
                            if (t.isEmpty()) return;
                            state.update(m);
                            records.addAll(render(t, control, now));
                        });
                for (String r : records) out.collect(r);
            }
        }

        private void emit(List<DeviceStateMachine.Transition> transitions, Iterable<Map.Entry<String, String>> control,
                          long now, Collector<String> out) {
            for (String r : render(transitions, control, now)) out.collect(r);
        }

        private static List<String> render(List<DeviceStateMachine.Transition> transitions, Iterable<Map.Entry<String, String>> control, long now) {
            List<String> out = new ArrayList<>();
            for (DeviceStateMachine.Transition t : transitions) {
                out.add(LoopHealthContext.deviceInterval(MAPPER, t.interval, t.kind, now));
                // CLOSE is rendered for the loops too: the mirror's loop_health_context row (keyed by
                // loop/role/from/revision) only gets its to_at from a record that carries the closed interval.
                long at = t.interval.toMs == null ? now : Math.max(t.interval.fromMs, t.interval.toMs - 1);
                for (Map.Entry<String, String> e : control) {
                    if (!e.getKey().startsWith("binding:")) continue;
                    LoopBindings lb = LoopBindings.fromStateJson(e.getValue());
                    if (lb == null) continue;
                    for (LoopBindings.Binding b : lb.bindingsForDevice(t.interval.deviceId, at)) {
                        out.add(LoopHealthContext.loopContext(MAPPER, lb.loopId, b.signalRole, b.bindingId, t.interval,
                                HealthEligibilityPolicy.evaluate(t.interval, lb.loopId + "." + b.signalRole), t.kind, now));
                    }
                }
            }
            return out;
        }
    }
}
