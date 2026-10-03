package com.ams.flink.cplm;

import com.ams.flink.cplm.replay.IotDbBoundedSource;
import org.apache.flink.api.common.RuntimeExecutionMode;
import org.apache.flink.streaming.api.datastream.DataStreamSource;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.sink.DiscardingSink;
import org.apache.flink.streaming.api.graph.StreamGraph;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

/**
 * 2026-10-03 (Marun, CHG-036): every historian-backed bounded run (REPLAY with source=iotdb, and every
 * EVIDENCE_RECONSTRUCTION since the workbench moved to the historian) was refused by the JobManager at
 * submit time: "Detected an UNBOUNDED source with the 'execution.runtime-mode' set to 'BATCH'". A legacy
 * {@code env.addSource(SourceFunction)} is CONTINUOUS_UNBOUNDED by declaration whatever its run() does;
 * the job runs in BATCH like its Kafka branch (bounded offsets). The historian source must be declared
 * BOUNDED. The graph check below is what the JobManager runs before scheduling - no cluster, no IoTDB.
 */
public class CplmHistoricalReplayJobTest {

    private static IotDbBoundedSource source() {
        return new IotDbBoundedSource("iotdb", 6667, "root", "root", "site1", "FIC10302", null, 0L, 1_000L);
    }

    @Test
    public void historianSourceIsBoundedSoBatchModeAcceptsIt() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setRuntimeMode(RuntimeExecutionMode.BATCH);
        DataStreamSource<CplmNormalizedSample> samples = CplmHistoricalReplayJob.historianSource(env, source());
        samples.addSink(new DiscardingSink<>());
        StreamGraph graph = env.getStreamGraph();          // the JobManager's pre-flight; threw for the legacy wiring
        assertEquals(1, graph.getSourceIDs().size());
        assertEquals(1, samples.getParallelism());
        assertTrue(graph.getStreamNode(graph.getSourceIDs().iterator().next()).getOperatorName().contains("iotdb"));
    }

    /**
     * Marun 2026-10-03 (CHG-036, third cause): the compose files hand the Flink containers the historian password as
     * IOTDB_PASS (what every other job reads), the replay job read IOTDB_PASSWORD and fell back to root -
     * "801: Authentication failed" on the first historian-backed run at a plant with a real password.
     */
    @Test
    public void historianCredentialsFollowTheFleetEnvNames() {
        java.util.Map<String, String> fleet = java.util.Map.of("IOTDB_PASS", "plant-secret", "IOTDB_USER", "ams");
        assertEquals("plant-secret", CplmHistoricalReplayJob.envFirst(fleet, "root", "IOTDB_PASS", "IOTDB_PASSWORD"));
        assertEquals("ams", CplmHistoricalReplayJob.envFirst(fleet, "root", "IOTDB_USER"));
        java.util.Map<String, String> legacy = java.util.Map.of("IOTDB_PASSWORD", "old-name");
        assertEquals("old-name", CplmHistoricalReplayJob.envFirst(legacy, "root", "IOTDB_PASS", "IOTDB_PASSWORD"));
        assertEquals("root", CplmHistoricalReplayJob.envFirst(java.util.Map.of("IOTDB_PASS", ""), "root", "IOTDB_PASS", "IOTDB_PASSWORD"));
    }

    @Test
    public void legacyAddSourceIsWhatBatchModeRefuses() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setRuntimeMode(RuntimeExecutionMode.BATCH);
        env.addSource(source()).addSink(new DiscardingSink<>());
        IllegalStateException e = assertThrows(IllegalStateException.class, env::getStreamGraph);
        assertTrue(e.getMessage(), e.getMessage().contains("UNBOUNDED"));
    }
}
