package com.ams.flink;

import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.flink.util.Collector;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Phase 7 — the previously-missing consumer of {@code traverse.analysis.executions}. Before this job existed the
 * analysis-service produced execution commands that nothing read, so every analysis sat "pending"
 * forever (audit §7.3). This job evaluates a calculation's arithmetic expression over the input values
 * carried on the command and emits the derived result to {@code traverse.analysis.results}, which analysis-service
 * consumes to update the execution and publish the value to the UNS as a derived measurement.
 *
 * Compute lives here (Flink), not in the browser or the service — honouring the Flink-only-compute
 * decision. The expression grammar is arithmetic-only (see {@link ExpressionEvaluator}).
 */
public class AnalysisExecutionJob {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        PipelineConfig cfg = PipelineConfig.fromArgs(args);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(60_000, CheckpointingMode.AT_LEAST_ONCE);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics("traverse.analysis.executions")
                .setGroupId("flink-analysis-execution")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        DataStream<String> results = env
                .fromSource(source, org.apache.flink.api.common.eventtime.WatermarkStrategy.noWatermarks(),
                        "analysis-executions-source")
                .process(new EvaluateCalculation())
                .name("evaluate-calculation")
                .uid("evaluate-calculation");

        KafkaSink<String> sink = KafkaSink.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("traverse.analysis.results")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();

        results.sinkTo(sink).name("analysis-results-sink");

        env.execute("AMS - Analysis Execution Engine");
    }

    /** Parses an execution command, evaluates the expression, and emits a result JSON. */
    public static class EvaluateCalculation extends ProcessFunction<String, String> {
        @Override
        public void processElement(String value, Context ctx, Collector<String> out) {
            ObjectNode result = MAPPER.createObjectNode();
            try {
                JsonNode cmd = MAPPER.readTree(value);
                String executionId = text(cmd, "executionId");
                String analysisId = text(cmd, "analysisId");
                String outputPath = text(cmd, "outputPath");
                String expression = text(cmd, "expression");
                result.put("executionId", executionId);
                result.put("analysisId", analysisId);
                result.put("outputPath", outputPath);

                if (expression == null || expression.isEmpty()) {
                    // Non-calculation analyses (rollup/threshold/…) are not handled by this job yet.
                    result.put("skipped", true);
                    result.put("reason", "no expression");
                    out.collect(MAPPER.writeValueAsString(result));
                    return;
                }

                Map<String, Double> vars = new HashMap<>();
                JsonNode inputs = cmd.get("inputs");
                if (inputs != null && inputs.isObject()) {
                    Iterator<Map.Entry<String, JsonNode>> it = inputs.fields();
                    while (it.hasNext()) {
                        Map.Entry<String, JsonNode> e = it.next();
                        if (e.getValue() != null && e.getValue().isNumber()) {
                            vars.put(e.getKey(), e.getValue().asDouble());
                        }
                    }
                }

                double v = ExpressionEvaluator.evaluate(expression, vars);
                // A non-finite result (÷0, overflow) is an error, not a silent success — Jackson would
                // otherwise serialize it as a quoted "Infinity"/"NaN" that the consumer reads as null.
                if (!Double.isFinite(v)) {
                    result.put("error", "non-finite result (" + v + ")");
                    out.collect(MAPPER.writeValueAsString(result));
                    return;
                }
                result.put("value", v);
                result.put("ts", ctx.timerService().currentProcessingTime());
                if (cmd.hasNonNull("unit")) result.put("unit", cmd.get("unit").asText());
                out.collect(MAPPER.writeValueAsString(result));
            } catch (Exception ex) {
                result.put("error", ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage());
                try {
                    out.collect(MAPPER.writeValueAsString(result));
                } catch (Exception ignored) {
                    // last-resort: drop a malformed record rather than fail the pipeline
                }
            }
        }

        private static String text(JsonNode n, String field) {
            JsonNode f = n.get(field);
            return f == null || f.isNull() ? null : f.asText();
        }
    }
}
